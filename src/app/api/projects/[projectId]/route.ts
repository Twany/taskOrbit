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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 400 });
  }

  const payload = (await request.json()) as {
    name?: string;
    color?: string;
    icon?: Project["icon"];
    status?: Project["status"];
  };
  const { projectId } = await params;

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

  const { data, error } = await supabase
    .from("projects")
    .update({
      name: payload.name.trim(),
      color: payload.color ?? "#31cc74",
      icon: payload.icon ?? "orbit",
      status: payload.status ?? "active",
    })
    .eq("id", projectId)
    .eq("user_id", user.id)
    .select("id,name,color,icon,status,sort_order")
    .single<ProjectRow>();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to update project" },
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 400 });
  }

  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Unable to delete project" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
