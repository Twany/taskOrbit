import { addDays, subDays } from "date-fns";

import type { DashboardData, Project, Task, Viewer } from "./types";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const isoStamp = (date: Date) => date.toISOString();

export function getDemoProjects(): Project[] {
  return [
    {
      id: "product",
      name: "TaskOrbit",
      color: "#31cc74",
      icon: "orbit",
      status: "active",
      sortOrder: 0,
    },
    {
      id: "studio",
      name: "Studio",
      color: "#62d6a2",
      icon: "spark",
      status: "active",
      sortOrder: 1,
    },
    {
      id: "ops",
      name: "Ops",
      color: "#7fd6f2",
      icon: "briefcase",
      status: "active",
      sortOrder: 2,
    },
    {
      id: "learning",
      name: "Learning",
      color: "#ffbe5d",
      icon: "book",
      status: "paused",
      sortOrder: 3,
    },
  ];
}

export function getDemoTasks(referenceDate = new Date()): Task[] {
  return [
    {
      id: "task-1",
      projectId: "product",
      title: "Finalize mobile task grouping",
      note: "Confirm Overdue / Today / Tomorrow / Backlog hierarchy.",
      state: "active",
      plannedDate: isoDate(referenceDate),
      completedAt: null,
      priority: "high",
      createdAt: isoStamp(subDays(referenceDate, 3)),
    },
    {
      id: "task-2",
      projectId: "product",
      title: "Draft Supabase table policies",
      note: "Keep single-user ownership with RLS.",
      state: "active",
      plannedDate: isoDate(addDays(referenceDate, 1)),
      completedAt: null,
      priority: "medium",
      createdAt: isoStamp(subDays(referenceDate, 2)),
    },
    {
      id: "task-3",
      projectId: "studio",
      title: "Refine bottom navigation spacing",
      note: "Match the lighter iOS-like reference proportions.",
      state: "active",
      plannedDate: isoDate(subDays(referenceDate, 1)),
      completedAt: null,
      priority: "high",
      createdAt: isoStamp(subDays(referenceDate, 5)),
    },
    {
      id: "task-4",
      projectId: "studio",
      title: "Capture App Store screenshot direction",
      note: "Use white canvas, green accents, restrained borders.",
      state: "active",
      plannedDate: null,
      completedAt: null,
      priority: "low",
      createdAt: isoStamp(subDays(referenceDate, 4)),
    },
    {
      id: "task-5",
      projectId: "ops",
      title: "Prepare cloud sync env vars",
      note: "Fill NEXT_PUBLIC_SUPABASE_URL and ANON_KEY locally.",
      state: "active",
      plannedDate: isoDate(referenceDate),
      completedAt: null,
      priority: "medium",
      createdAt: isoStamp(subDays(referenceDate, 1)),
    },
    {
      id: "task-6",
      projectId: "ops",
      title: "Write onboarding copy for first launch",
      note: "Explain that this tool only cares about what to do today.",
      state: "done",
      plannedDate: isoDate(subDays(referenceDate, 1)),
      completedAt: isoStamp(subDays(referenceDate, 1)),
      priority: "medium",
      createdAt: isoStamp(subDays(referenceDate, 6)),
    },
    {
      id: "task-7",
      projectId: "learning",
      title: "Collect three ideas for weekly review",
      note: "Optional backlog item for Sunday.",
      state: "active",
      plannedDate: null,
      completedAt: null,
      priority: "low",
      createdAt: isoStamp(subDays(referenceDate, 7)),
    },
  ];
}

export function buildDemoDashboardData(options?: {
  viewer?: Partial<Viewer>;
  source?: DashboardData["source"];
}): DashboardData {
  const viewer: Viewer = {
    label: options?.viewer?.label ?? "You",
    email: options?.viewer?.email,
    isAuthenticated: options?.viewer?.isAuthenticated ?? false,
    cloudSyncConfigured: options?.viewer?.cloudSyncConfigured ?? false,
  };

  return {
    viewer,
    source: options?.source ?? "demo",
    projects: getDemoProjects(),
    tasks: getDemoTasks(),
    generatedAt: new Date().toISOString(),
  };
}
