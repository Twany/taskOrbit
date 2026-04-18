import "server-only";

import type { DashboardData, Project, Task } from "./types";
import { buildDemoDashboardData } from "./demo-data";
import { hasSupabaseEnv } from "./supabase/env";
import { createSupabaseServerClient } from "./supabase/server";

type ProjectRow = {
  id: string;
  name: string;
  color: string;
  icon: Project["icon"];
  status: Project["status"];
  sort_order: number;
};

type TaskRow = {
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

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    status: row.status,
    sortOrder: row.sort_order,
  };
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    note: row.note ?? undefined,
    state: row.state,
    plannedDate: row.planned_date,
    completedAt: row.completed_at,
    priority: row.priority,
    createdAt: row.created_at,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!hasSupabaseEnv()) {
    return buildDemoDashboardData();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return buildDemoDashboardData({
      viewer: {
        label: "You",
        cloudSyncConfigured: true,
      },
    });
  }

  const [projectsResult, tasksResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,color,icon,status,sort_order")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("tasks")
      .select("id,project_id,title,note,state,planned_date,completed_at,priority,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (projectsResult.error || tasksResult.error) {
    return buildDemoDashboardData({
      viewer: {
        label: user.email?.split("@")[0] ?? "You",
        email: user.email,
        isAuthenticated: true,
        cloudSyncConfigured: true,
      },
    });
  }

  return {
    viewer: {
      label: user.user_metadata.full_name ?? user.email?.split("@")[0] ?? "You",
      email: user.email,
      isAuthenticated: true,
      cloudSyncConfigured: true,
    },
    source: "supabase",
    projects: (projectsResult.data ?? []).map(mapProject),
    tasks: (tasksResult.data ?? []).map(mapTask),
    generatedAt: new Date().toISOString(),
  };
}

export async function getTaskById(taskId: string) {
  const dashboard = await getDashboardData();
  const task = dashboard.tasks.find((item) => item.id === taskId) ?? null;

  if (!task) {
    return null;
  }

  const project = dashboard.projects.find((item) => item.id === task.projectId) ?? null;

  return { dashboard, task, project };
}
