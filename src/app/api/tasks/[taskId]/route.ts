import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";

type TaskUpdateRow = {
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 400 });
  }

  const payload = (await request.json()) as {
    bucket?: "backlog" | "today" | "tomorrow" | "done";
    action?: "skip-today" | "pause-repeat";
  };
  const { taskId } = await params;

  if (!payload.bucket && !payload.action) {
    return NextResponse.json({ error: "Missing task action" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentTask, error: currentTaskError } = await supabase
    .from("tasks")
    .select("id,project_id,template_id,title,note,state,planned_date,task_date,completed_at,priority,is_skipped,created_at")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single<TaskUpdateRow>();

  if (currentTaskError || !currentTask) {
    return NextResponse.json(
      { error: currentTaskError?.message ?? "Task not found" },
      { status: 404 },
    );
  }

  let repeatType: Task["repeatType"] = null;

  if (currentTask.template_id) {
    const { data: template } = await supabase
      .from("task_templates")
      .select("repeat_type")
      .eq("id", currentTask.template_id)
      .eq("user_id", user.id)
      .maybeSingle<{ repeat_type: "daily" | "weekdays" }>();

    repeatType = template?.repeat_type ?? null;
  }

  if (payload.action === "skip-today") {
    const { data, error } = await supabase
      .from("tasks")
      .update({
        is_skipped: true,
      })
      .eq("id", taskId)
      .eq("user_id", user.id)
      .select("id,project_id,template_id,title,note,state,planned_date,task_date,completed_at,priority,is_skipped,created_at")
      .single<TaskUpdateRow>();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to skip task" },
        { status: 400 },
      );
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
        repeatType,
        isSkipped: data.is_skipped,
        createdAt: data.created_at,
      } satisfies Task,
    });
  }

  if (payload.action === "pause-repeat") {
    if (!currentTask.template_id) {
      return NextResponse.json({ error: "Task has no repeat template" }, { status: 400 });
    }

    const { error } = await supabase
      .from("task_templates")
      .update({ active: false })
      .eq("id", currentTask.template_id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Unable to pause repeat" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      task: {
        id: currentTask.id,
        projectId: currentTask.project_id,
        templateId: currentTask.template_id,
        title: currentTask.title,
        note: currentTask.note ?? undefined,
        state: currentTask.state,
        plannedDate: currentTask.planned_date,
        taskDate: currentTask.task_date,
        completedAt: currentTask.completed_at,
        priority: currentTask.priority,
        repeatType: null,
        isSkipped: currentTask.is_skipped,
        createdAt: currentTask.created_at,
      } satisfies Task,
    });
  }

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const updates =
    payload.bucket === "today"
      ? {
          state: "active" as const,
          planned_date: today.toISOString().slice(0, 10),
          completed_at: null,
        }
      : payload.bucket === "tomorrow"
        ? {
            state: "active" as const,
            planned_date: tomorrow.toISOString().slice(0, 10),
            completed_at: null,
          }
        : payload.bucket === "done"
          ? {
              state: "done" as const,
              planned_date: today.toISOString().slice(0, 10),
              completed_at: new Date().toISOString(),
            }
          : {
              state: "active" as const,
              planned_date: null,
              completed_at: null,
            };

  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("user_id", user.id)
    .select("id,project_id,template_id,title,note,state,planned_date,task_date,completed_at,priority,is_skipped,created_at")
    .single<TaskUpdateRow>();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Unable to update task" }, { status: 400 });
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
      repeatType,
      isSkipped: data.is_skipped,
      createdAt: data.created_at,
    } satisfies Task,
  });
}
