import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";

type TaskInsertRow = {
  id: string;
  project_id: string;
  title: string;
  note: string | null;
  state: Task["state"];
  planned_date: string | null;
  completed_at: string | null;
  priority: Task["priority"];
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
  const plannedDate =
    payload.bucket === "today"
      ? today.toISOString().slice(0, 10)
      : payload.bucket === "tomorrow"
        ? tomorrow.toISOString().slice(0, 10)
        : null;

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      project_id: payload.projectId,
      title: payload.title,
      priority: payload.priority ?? "medium",
      state: "active",
      planned_date: plannedDate,
    })
    .select("id,project_id,title,note,state,planned_date,completed_at,priority,created_at")
    .single<TaskInsertRow>();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Unable to create task" }, { status: 400 });
  }

  return NextResponse.json({
    task: {
      id: data.id,
      projectId: data.project_id,
      title: data.title,
      note: data.note ?? undefined,
      state: data.state,
      plannedDate: data.planned_date,
      completedAt: data.completed_at,
      priority: data.priority,
      createdAt: data.created_at,
    } satisfies Task,
  });
}
