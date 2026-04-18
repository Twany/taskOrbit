import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";

type ProjectRow = {
  id: string;
  name: string;
  color: string;
  icon: Project["icon"];
  status: Project["status"];
  sort_order: number;
};

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 400 });
  }

  const payload = (await request.json()) as {
    name?: string;
    color?: string;
    icon?: Project["icon"];
    status?: Project["status"];
  };

  if (!payload.name?.trim()) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: lastProject } = await supabase
    .from("projects")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: payload.name.trim(),
      color: payload.color ?? "#31cc74",
      icon: payload.icon ?? "orbit",
      status: payload.status ?? "active",
      sort_order: (lastProject?.sort_order ?? -1) + 1,
    })
    .select("id,name,color,icon,status,sort_order")
    .single<ProjectRow>();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to create project" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    project: {
      id: data.id,
      name: data.name,
      color: data.color,
      icon: data.icon,
      status: data.status,
      sortOrder: data.sort_order,
    } satisfies Project,
  });
}
