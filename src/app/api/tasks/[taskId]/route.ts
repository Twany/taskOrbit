import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RepeatType, Task, TaskEvidenceAction, WeeklyRepeatWeekday } from "@/lib/types";

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

function getNextWeekdayDate(targetWeekday: WeeklyRepeatWeekday, referenceDate = new Date()) {
  const nextDate = new Date(referenceDate);
  const delta = (targetWeekday - referenceDate.getDay() + 7) % 7;
  nextDate.setDate(referenceDate.getDate() + delta);
  return nextDate;
}

function serializeTask(row: TaskUpdateRow, repeatType: Task["repeatType"]) {
  return {
    id: row.id,
    projectId: row.project_id,
    templateId: row.template_id,
    title: row.title,
    note: row.note ?? undefined,
    state: row.state,
    plannedDate: row.planned_date,
    taskDate: row.task_date,
    completedAt: row.completed_at,
    priority: row.priority,
    repeatType,
    isSkipped: row.is_skipped,
    createdAt: row.created_at,
  } satisfies Task;
}

async function insertTaskEvidence(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  taskId: string,
  action: TaskEvidenceAction,
  detail: string,
  task: TaskUpdateRow,
  userId: string,
) {
  await supabase.from("task_evidence").insert({
    user_id: userId,
    task_id: taskId,
    project_id: task.project_id,
    template_id: task.template_id,
    action,
    detail,
    task_date: task.task_date,
  });
}

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
    title?: string;
    note?: string;
    projectId?: string;
    priority?: Task["priority"];
    repeatType?: RepeatType;
    detail?: string;
  };
  const { taskId } = await params;
  const isEditing =
    typeof payload.title === "string" ||
    typeof payload.projectId === "string" ||
    typeof payload.priority === "string" ||
    typeof payload.repeatType === "string" ||
    typeof payload.note === "string";
  const normalizedDetail = payload.detail?.trim();

  if (!payload.bucket && !payload.action && !isEditing) {
    return NextResponse.json({ error: "Missing task action" }, { status: 400 });
  }

  if (
    payload.bucket &&
    !(["backlog", "today", "tomorrow", "done"] as const).includes(payload.bucket)
  ) {
    return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
  }

  if (
    payload.action &&
    !(["skip-today", "pause-repeat"] as const).includes(payload.action)
  ) {
    return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
  }

  if (
    payload.priority &&
    !(["low", "medium", "high"] as const).includes(payload.priority)
  ) {
    return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
  }

  if (
    payload.repeatType &&
    !(["none", "daily", "weekly"] as const).includes(payload.repeatType)
  ) {
    return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
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
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const { data: profile } = await supabase
    .from("profiles")
    .select("weekly_repeat_weekday")
    .eq("id", user.id)
    .maybeSingle<{ weekly_repeat_weekday: WeeklyRepeatWeekday }>();
  const weeklyRepeatWeekday = profile?.weekly_repeat_weekday ?? 5;
  const nextWeeklyDate = getNextWeekdayDate(weeklyRepeatWeekday, today);

  if (currentTask.template_id) {
    const { data: template } = await supabase
      .from("task_templates")
      .select("repeat_type")
      .eq("id", currentTask.template_id)
      .eq("user_id", user.id)
      .maybeSingle<{ repeat_type: "daily" | "weekly" }>();

    repeatType = template?.repeat_type ?? null;
  }

  if (isEditing) {
    const nextRepeatType = payload.repeatType ?? repeatType ?? "none";
    const nextBucket = payload.bucket ?? "backlog";
    const normalizedTitle = payload.title?.trim();
    const normalizedNote = payload.note?.trim() || null;

    if (!normalizedTitle || !payload.projectId || !payload.priority) {
      return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
    }

    if (nextBucket === "done" && !normalizedDetail) {
      return NextResponse.json({ error: "Task evidence required" }, { status: 400 });
    }

    let nextTemplateId = currentTask.template_id;

    if (nextRepeatType === "none" && currentTask.template_id) {
      const { error: deleteTemplateError } = await supabase
        .from("task_templates")
        .delete()
        .eq("id", currentTask.template_id)
        .eq("user_id", user.id);

      if (deleteTemplateError) {
        return NextResponse.json({ error: "Unable to update task" }, { status: 400 });
      }

      nextTemplateId = null;
    }

    if (nextRepeatType !== "none") {
      if (currentTask.template_id) {
        const { error: templateUpdateError } = await supabase
          .from("task_templates")
          .update({
            project_id: payload.projectId,
            title: normalizedTitle,
            note: normalizedNote,
            priority: payload.priority,
            repeat_type: nextRepeatType,
            active: true,
          })
          .eq("id", currentTask.template_id)
          .eq("user_id", user.id);

        if (templateUpdateError) {
          return NextResponse.json({ error: "Unable to update task" }, { status: 400 });
        }
      } else {
        const { data: template, error: templateInsertError } = await supabase
          .from("task_templates")
          .insert({
            user_id: user.id,
            project_id: payload.projectId,
            title: normalizedTitle,
            note: normalizedNote,
            priority: payload.priority,
            repeat_type: nextRepeatType,
            active: true,
          })
          .select("id")
          .single<{ id: string }>();

        if (templateInsertError || !template) {
          return NextResponse.json({ error: "Unable to update task" }, { status: 400 });
        }

        nextTemplateId = template.id;
      }
    }

    const plannedDate =
      nextRepeatType === "daily"
        ? today.toISOString().slice(0, 10)
        : nextRepeatType === "weekly"
          ? nextWeeklyDate.toISOString().slice(0, 10)
          : nextBucket === "today"
            ? today.toISOString().slice(0, 10)
            : nextBucket === "tomorrow"
              ? tomorrow.toISOString().slice(0, 10)
              : nextBucket === "done"
                ? currentTask.planned_date ?? today.toISOString().slice(0, 10)
                : null;

    const updates = {
      title: normalizedTitle,
      note: normalizedNote,
      project_id: payload.projectId,
      template_id: nextTemplateId,
      priority: payload.priority,
      state: nextBucket === "done" ? ("done" as const) : ("active" as const),
      planned_date: plannedDate,
      task_date: nextRepeatType === "none" ? plannedDate : plannedDate,
      completed_at:
        nextBucket === "done" && nextRepeatType === "none"
          ? currentTask.completed_at ?? new Date().toISOString()
          : null,
      is_skipped: false,
    };

    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .eq("user_id", user.id)
      .select("id,project_id,template_id,title,note,state,planned_date,task_date,completed_at,priority,is_skipped,created_at")
      .single<TaskUpdateRow>();

    if (error || !data) {
      return NextResponse.json({ error: "Unable to update task" }, { status: 400 });
    }

    if (nextBucket === "done" && normalizedDetail) {
      await insertTaskEvidence(supabase, taskId, "done", normalizedDetail, data, user.id);
    }

    return NextResponse.json({
      task: serializeTask(data, nextRepeatType === "none" ? null : nextRepeatType),
    });
  }

  if (payload.action === "skip-today") {
    if (!normalizedDetail) {
      return NextResponse.json({ error: "Task evidence required" }, { status: 400 });
    }

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

    await insertTaskEvidence(supabase, taskId, "skip", normalizedDetail, data, user.id);

    return NextResponse.json({
      task: serializeTask(data, repeatType),
    });
  }

  if (payload.action === "pause-repeat") {
    if (!normalizedDetail) {
      return NextResponse.json({ error: "Task evidence required" }, { status: 400 });
    }

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

    await insertTaskEvidence(supabase, taskId, "pause", normalizedDetail, currentTask, user.id);

    return NextResponse.json({
      task: serializeTask(currentTask, null),
    });
  }

  if (payload.bucket === "done" && !normalizedDetail) {
    return NextResponse.json({ error: "Task evidence required" }, { status: 400 });
  }

  const updates =
    payload.bucket === "today"
      ? {
          state: "active" as const,
          planned_date:
            repeatType === "weekly"
              ? nextWeeklyDate.toISOString().slice(0, 10)
              : today.toISOString().slice(0, 10),
          task_date:
            repeatType === "weekly"
              ? nextWeeklyDate.toISOString().slice(0, 10)
              : today.toISOString().slice(0, 10),
          is_skipped: false,
          completed_at: null,
        }
      : payload.bucket === "tomorrow"
        ? {
            state: "active" as const,
            planned_date: tomorrow.toISOString().slice(0, 10),
            task_date: tomorrow.toISOString().slice(0, 10),
            is_skipped: false,
            completed_at: null,
          }
        : payload.bucket === "done"
          ? {
              state: "done" as const,
              planned_date: today.toISOString().slice(0, 10),
              task_date: today.toISOString().slice(0, 10),
              is_skipped: false,
              completed_at: new Date().toISOString(),
            }
          : {
              state: "active" as const,
              planned_date: null,
              task_date: null,
              is_skipped: false,
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

  if (payload.bucket === "done" && normalizedDetail) {
    await insertTaskEvidence(supabase, taskId, "done", normalizedDetail, data, user.id);
  }

  return NextResponse.json({
    task: serializeTask(data, repeatType),
  });
}
