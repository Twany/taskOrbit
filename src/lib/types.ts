export type ProjectStatus = "active" | "paused";
export type TaskPriority = "low" | "medium" | "high";
export type TaskState = "active" | "done";
export type TaskBucket = "overdue" | "today" | "tomorrow" | "backlog" | "done";
export type RepeatType = "none" | "daily" | "weekly";
export type TaskEvidenceAction = "done" | "skip" | "pause";
export type AppScreen = "tasks" | "projects" | "review" | "settings";
export type TaskFilter = "all" | "my-day" | "my-week";
export type WeeklyRepeatWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Viewer {
  label: string;
  email?: string;
  isAuthenticated: boolean;
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
  templateId: string | null;
  title: string;
  note?: string;
  state: TaskState;
  plannedDate: string | null;
  taskDate: string | null;
  completedAt: string | null;
  priority: TaskPriority;
  repeatType: RepeatType | null;
  isSkipped: boolean;
  createdAt: string;
}

export interface TaskEvidence {
  id: string;
  action: TaskEvidenceAction;
  detail: string;
  createdAt: string;
}

export interface DashboardData {
  viewer: Viewer;
  projects: Project[];
  tasks: Task[];
  weeklyRepeatWeekday: WeeklyRepeatWeekday;
  appIssue?: "config-missing" | "load-failed" | null;
  generatedAt: string;
}
