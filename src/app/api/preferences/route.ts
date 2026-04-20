import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WeeklyRepeatWeekday } from "@/lib/types";

function getNextWeekdayDate(targetWeekday: WeeklyRepeatWeekday, referenceDate = new Date()) {
  const nextDate = new Date(referenceDate);
  const delta = (targetWeekday - referenceDate.getDay() + 7) % 7;
  nextDate.setDate(referenceDate.getDate() + delta);
  return nextDate;
}

export async function PATCH(request: Request) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "App unavailable" }, { status: 400 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    weeklyRepeatWeekday?: number;
  };

  if (
    typeof payload.weeklyRepeatWeekday !== "number" ||
    payload.weeklyRepeatWeekday < 0 ||
    payload.weeklyRepeatWeekday > 6
  ) {
    return NextResponse.json({ error: "Invalid weekday" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekday = payload.weeklyRepeatWeekday as WeeklyRepeatWeekday;
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ weekly_repeat_weekday: weekday })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json({ error: "Unable to save preference" }, { status: 400 });
  }

  const { data: weeklyTemplates, error: templatesError } = await supabase
    .from("task_templates")
    .select("id")
    .eq("user_id", user.id)
    .eq("repeat_type", "weekly")
    .eq("active", true);

  if (templatesError) {
    return NextResponse.json({ error: "Unable to update weekly tasks" }, { status: 400 });
  }

  const templateIds = (weeklyTemplates ?? []).map((template) => template.id);

  if (templateIds.length > 0) {
    const nextDate = getNextWeekdayDate(weekday);
    const nextDateKey = nextDate.toISOString().slice(0, 10);
    const { error: tasksError } = await supabase
      .from("tasks")
      .update({
        planned_date: nextDateKey,
        task_date: nextDateKey,
        state: "active",
        completed_at: null,
        is_skipped: false,
      })
      .eq("user_id", user.id)
      .in("template_id", templateIds)
      .eq("state", "active");

    if (tasksError) {
      return NextResponse.json({ error: "Unable to update weekly tasks" }, { status: 400 });
    }
  }

  return NextResponse.json({ weeklyRepeatWeekday: weekday });
}
