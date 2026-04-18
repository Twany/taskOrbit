export type ProjectStatus = "active" | "paused";
export type TaskPriority = "low" | "medium" | "high";
export type TaskState = "active" | "done";
export type TaskBucket = "overdue" | "today" | "tomorrow" | "backlog" | "done";
export type AppScreen = "tasks" | "projects" | "review" | "settings";
export type TaskFilter = "all" | "my-day" | "my-week";
export type DataSource = "demo" | "supabase";

export interface Viewer {
  label: string;
  email?: string;
  isAuthenticated: boolean;
  cloudSyncConfigured: boolean;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: "orbit" | "spark" | "briefcase" | "leaf" | "book";
  status: ProjectStatus;
  sortOrder: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  note?: string;
  state: TaskState;
  plannedDate: string | null;
  completedAt: string | null;
  priority: TaskPriority;
  createdAt: string;
}

export interface DashboardData {
  viewer: Viewer;
  source: DataSource;
  projects: Project[];
  tasks: Task[];
  generatedAt: string;
}
