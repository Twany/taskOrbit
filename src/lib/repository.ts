import "server-only";

import type { DashboardData, Project, RepeatType, Task } from "./types";
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

type TaskTemplateRow = {
	id: string;
	project_id: string;
	title: string;
	note: string | null;
	priority: Task["priority"];
	repeat_type: Exclude<RepeatType, "none">;
	active: boolean;
};

type TaskRow = {
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

function mapTask(row: TaskRow, repeatType: RepeatType | null): Task {
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
	};
}

function shouldGenerateTemplateForDate(
	template: TaskTemplateRow,
	referenceDate: Date,
) {
	if (template.repeat_type === "daily") {
		return true;
	}

	const day = referenceDate.getDay();
	return day !== 0 && day !== 6;
}

async function ensureTodayRecurringTasks(
	userId: string,
	templates: TaskTemplateRow[],
) {
	if (templates.length === 0) {
		return;
	}

	const supabase = await createSupabaseServerClient();
	const today = new Date();
	const todayKey = today.toISOString().slice(0, 10);
	const activeTemplates = templates.filter(
		(template) =>
			template.active && shouldGenerateTemplateForDate(template, today),
	);

	if (activeTemplates.length === 0) {
		return;
	}

	const { data: existingRows, error: existingError } = await supabase
		.from("tasks")
		.select("template_id,task_date")
		.eq("user_id", userId)
		.eq("task_date", todayKey)
		.in(
			"template_id",
			activeTemplates.map((template) => template.id),
		);

	if (existingError) {
		return;
	}

	const existingTemplateIds = new Set(
		(existingRows ?? [])
			.map((row) => row.template_id)
			.filter((value): value is string => Boolean(value)),
	);

	const missingTemplates = activeTemplates.filter(
		(template) => !existingTemplateIds.has(template.id),
	);

	if (missingTemplates.length === 0) {
		return;
	}

	const { error } = await supabase.from("tasks").insert(
		missingTemplates.map((template) => ({
			user_id: userId,
			project_id: template.project_id,
			template_id: template.id,
			title: template.title,
			note: template.note,
			priority: template.priority,
			state: "active",
			planned_date: todayKey,
			task_date: todayKey,
			is_skipped: false,
		})),
	);

	if (error && error.code !== "23505") {
		console.error("ensureTodayRecurringTasks", error.message);
	}
}

export async function getDashboardData(): Promise<DashboardData> {
	if (!hasSupabaseEnv()) {
		return {
			viewer: {
				label: "You",
				isAuthenticated: false,
			},
			projects: [],
			tasks: [],
			appIssue: "config-missing",
			generatedAt: new Date().toISOString(),
		};
	}

	const supabase = await createSupabaseServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return {
			viewer: {
				label: "You",
				isAuthenticated: false,
			},
			projects: [],
			tasks: [],
			appIssue: null,
			generatedAt: new Date().toISOString(),
		};
	}

	const { data: templateRows, error: templatesError } = await supabase
		.from("task_templates")
		.select("id,project_id,title,note,priority,repeat_type,active")
		.eq("user_id", user.id);

	if (!templatesError) {
		await ensureTodayRecurringTasks(user.id, templateRows ?? []);
	}

	const [projectsResult, tasksResult, allTemplatesResult] = await Promise.all([
		supabase
			.from("projects")
			.select("id,name,color,icon,status,sort_order")
			.eq("user_id", user.id)
			.order("sort_order", { ascending: true }),
		supabase
			.from("tasks")
			.select(
				"id,project_id,template_id,title,note,state,planned_date,task_date,completed_at,priority,is_skipped,created_at",
			)
			.eq("user_id", user.id)
			.eq("is_skipped", false)
			.order("created_at", { ascending: false }),
		supabase
			.from("task_templates")
			.select("id,repeat_type,active")
			.eq("user_id", user.id),
	]);

	if (
		projectsResult.error ||
		tasksResult.error ||
		allTemplatesResult.error
	) {
			return {
				viewer: {
					label: user.email?.split("@")[0] ?? "You",
					email: user.email,
					isAuthenticated: true,
				},
				projects: [],
				tasks: [],
				appIssue: "load-failed",
			generatedAt: new Date().toISOString(),
		};
	}

	const repeatByTemplateId = new Map(
		(allTemplatesResult.data ?? []).map((template) => [
			template.id,
			template.active ? template.repeat_type : null,
		]),
	);

	return {
		viewer: {
			label: user.user_metadata.full_name ?? user.email?.split("@")[0] ?? "You",
			email: user.email,
			isAuthenticated: true,
		},
		projects: (projectsResult.data ?? []).map(mapProject),
		tasks: (tasksResult.data ?? []).map((task) =>
			mapTask(task, task.template_id ? repeatByTemplateId.get(task.template_id) ?? null : null),
		),
		appIssue: null,
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
