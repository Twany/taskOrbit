import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RepeatType, Task } from "@/lib/types";

type TaskInsertRow = {
  id: string;
  project_id: string;
  template_id: string | null;
  title: string;
  note: string | null;
  state: Task["state"];
  planned_date: string | null;
  task_date: string | null;
  completed_at: string | null;
  priority: Task["priority"];
  is_skipped: boolean;
  created_at: string;
};

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 400 });
  }

  const payload = (await request.json()) as {
    title?: string;
    projectId?: string;
    bucket?: "backlog" | "today" | "tomorrow";
    priority?: Task["priority"];
    repeatType?: RepeatType;
  };

  if (!payload.title || !payload.projectId || !payload.bucket) {
    return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const todayKey = today.toISOString().slice(0, 10);
  const repeatType = payload.repeatType ?? "none";
  const isRecurring = repeatType !== "none";
  const plannedDate =
    isRecurring
      ? todayKey
      : payload.bucket === "today"
      ? today.toISOString().slice(0, 10)
      : payload.bucket === "tomorrow"
        ? tomorrow.toISOString().slice(0, 10)
        : null;
  let templateId: string | null = null;

  if (isRecurring) {
    const { data: template, error: templateError } = await supabase
      .from("task_templates")
      .insert({
        user_id: user.id,
        project_id: payload.projectId,
        title: payload.title.trim(),
        priority: payload.priority ?? "medium",
        repeat_type: repeatType,
        active: true,
      })
      .select("id")
      .single<{ id: string }>();

    if (templateError || !template) {
      return NextResponse.json(
        { error: templateError?.message ?? "Unable to create repeat task" },
        { status: 400 },
      );
    }

    templateId = template.id;
  }

  const { data, error } = await supabase
    .from("tasks")
      .insert({
        user_id: user.id,
        project_id: payload.projectId,
        template_id: templateId,
      title: payload.title.trim(),
        priority: payload.priority ?? "medium",
      state: "active",
      planned_date: plannedDate,
      task_date: isRecurring ? todayKey : plannedDate,
      is_skipped: false,
    })
    .select("id,project_id,template_id,title,note,state,planned_date,task_date,completed_at,priority,is_skipped,created_at")
    .single<TaskInsertRow>();

  if (error || !data) {
    if (templateId) {
      await supabase.from("task_templates").delete().eq("id", templateId).eq("user_id", user.id);
    }

    return NextResponse.json({ error: error?.message ?? "Unable to create task" }, { status: 400 });
  }

  return NextResponse.json({
    task: {
      id: data.id,
      projectId: data.project_id,
      templateId: data.template_id,
      title: data.title,
      note: data.note ?? undefined,
      state: data.state,
      plannedDate: data.planned_date,
      taskDate: data.task_date,
      completedAt: data.completed_at,
      priority: data.priority,
      repeatType: isRecurring ? repeatType : null,
      isSkipped: data.is_skipped,
      createdAt: data.created_at,
    } satisfies Task,
  });
}
