import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";

type TaskUpdateRow = {
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 400 });
  }

  const payload = (await request.json()) as {
    bucket?: "backlog" | "today" | "tomorrow" | "done";
  };
  const { taskId } = await params;

  if (!payload.bucket) {
    return NextResponse.json({ error: "Missing task bucket" }, { status: 400 });
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
    .select("id,project_id,title,note,state,planned_date,completed_at,priority,created_at")
    .single<TaskUpdateRow>();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Unable to update task" }, { status: 400 });
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
