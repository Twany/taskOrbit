"use client";

import {
	useCallback,
	useDeferredValue,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import {addDays, format} from "date-fns";
import Link from "next/link";
import {
	ArrowUpRight,
	BookOpen,
	BriefcaseBusiness,
	CalendarDays,
	CheckCircle2,
	ChevronRight,
	FolderKanban,
	Layers3,
	Leaf,
	Orbit,
	Pencil,
	Plus,
	Settings,
	Sparkles,
} from "lucide-react";

import {
	countTodayOpenTasks,
	getProjectStats,
	getTaskBucket,
	getWeekBuckets,
	groupTasks,
} from "@/lib/task-groups";
import {
	formatWeekdayLabel,
	formatLocaleDate,
	formatLocaleDateTime,
	formatLocaleWeekday,
	getDictionary,
	type AppLocale,
} from "@/lib/locale";
import type {
	AppScreen,
	DashboardData,
	Project,
	RepeatType,
	Task,
	TaskBucket,
	TaskPriority,
	WeeklyRepeatWeekday,
} from "@/lib/types";
import {cn} from "@/lib/utils";

type ComposerState = {
	title: string;
	note: string;
	projectId: string;
	bucket: Extract<TaskBucket, "backlog" | "today" | "tomorrow">;
	priority: TaskPriority;
	repeatType: RepeatType;
};

type TaskMutationPayload = {
	bucket?: Extract<TaskBucket, "backlog" | "today" | "tomorrow" | "done">;
	action?: "skip-today" | "pause-repeat";
	detail?: string;
};

type TaskActionPromptState = {
	taskId: string;
	kind: "done" | "skip" | "pause";
	mutation: TaskMutationPayload;
};

const PROJECT_ALL_ID = "all-projects";
const APP_PREFERENCES_KEY = "taskorbit.preferences";
const PROJECT_COLOR_OPTIONS = [
	"#31cc74",
	"#62d6a2",
	"#7fd6f2",
	"#ffbe5d",
	"#ff8f8b",
] as const;
const PROJECT_ICON_OPTIONS: Project["icon"][] = [
	"orbit",
	"spark",
	"briefcase",
	"leaf",
	"book",
];
const TODAY_LIMIT_OPTIONS = [3, 5, 7] as const;
const WEEKLY_REPEAT_WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0] as const;

type AppPreferences = {
	openReminderEnabled: boolean;
	defaultTaskBucket: ComposerState["bucket"];
	preferredTodayLimit: (typeof TODAY_LIMIT_OPTIONS)[number];
	showDoneColumn: boolean;
	weeklyRepeatWeekday: WeeklyRepeatWeekday;
};

const DEFAULT_PREFERENCES: AppPreferences = {
	openReminderEnabled: true,
	defaultTaskBucket: "backlog",
	preferredTodayLimit: 5,
	showDoneColumn: true,
	weeklyRepeatWeekday: 5,
};

function readStoredPreferences(
	serverWeeklyRepeatWeekday: WeeklyRepeatWeekday = 5,
) {
	if (typeof window === "undefined") {
		return {
			...DEFAULT_PREFERENCES,
			weeklyRepeatWeekday: serverWeeklyRepeatWeekday,
		};
	}

	const savedPreferences = window.localStorage.getItem(APP_PREFERENCES_KEY);

	if (!savedPreferences) {
		return {
			...DEFAULT_PREFERENCES,
			weeklyRepeatWeekday: serverWeeklyRepeatWeekday,
		};
	}

	try {
		const parsed = JSON.parse(savedPreferences) as Partial<AppPreferences>;

		return {
			openReminderEnabled:
				parsed.openReminderEnabled ??
				DEFAULT_PREFERENCES.openReminderEnabled,
			defaultTaskBucket:
				parsed.defaultTaskBucket ??
				DEFAULT_PREFERENCES.defaultTaskBucket,
			preferredTodayLimit:
				parsed.preferredTodayLimit &&
				TODAY_LIMIT_OPTIONS.includes(parsed.preferredTodayLimit)
					? parsed.preferredTodayLimit
					: DEFAULT_PREFERENCES.preferredTodayLimit,
			showDoneColumn:
				parsed.showDoneColumn ?? DEFAULT_PREFERENCES.showDoneColumn,
			weeklyRepeatWeekday:
				typeof parsed.weeklyRepeatWeekday === "number" &&
				parsed.weeklyRepeatWeekday >= 0 &&
				parsed.weeklyRepeatWeekday <= 6
					? (parsed.weeklyRepeatWeekday as WeeklyRepeatWeekday)
					: serverWeeklyRepeatWeekday,
		} satisfies AppPreferences;
	} catch {
		window.localStorage.removeItem(APP_PREFERENCES_KEY);
		return {
			...DEFAULT_PREFERENCES,
			weeklyRepeatWeekday: serverWeeklyRepeatWeekday,
		};
	}
}

type ProjectEditorState = {
	id: string | null;
	name: string;
	color: string;
	icon: Project["icon"];
	status: Project["status"];
};

const CREATE_PROJECT_OPTION = "__create-project__";

function createProjectEditor(project?: Project): ProjectEditorState {
	return {
		id: project?.id ?? null,
		name: project?.name ?? "",
		color: project?.color ?? PROJECT_COLOR_OPTIONS[0],
		icon: project?.icon ?? "orbit",
		status: project?.status ?? "active",
	};
}

function projectIcon(icon: Project["icon"], className?: string) {
	switch (icon) {
		case "spark":
			return <Sparkles className={className} />;
		case "briefcase":
			return <BriefcaseBusiness className={className} />;
		case "leaf":
			return <Leaf className={className} />;
		case "book":
			return <BookOpen className={className} />;
		default:
			return <Orbit className={className} />;
	}
}

function buildTaskPatch(bucket: NonNullable<TaskMutationPayload["bucket"]>) {
	const today = new Date();
	const nextDay = addDays(today, 1);

	if (bucket === "today") {
		return {
			state: "active" as const,
			plannedDate: format(today, "yyyy-MM-dd"),
			completedAt: null,
		};
	}

	if (bucket === "tomorrow") {
		return {
			state: "active" as const,
			plannedDate: format(nextDay, "yyyy-MM-dd"),
			completedAt: null,
		};
	}

	if (bucket === "done") {
		return {
			state: "done" as const,
			plannedDate: format(today, "yyyy-MM-dd"),
			completedAt: new Date().toISOString(),
		};
	}

	return {
		state: "active" as const,
		plannedDate: null,
		completedAt: null,
	};
}

function formatBucketLabel(bucket: TaskBucket, locale: AppLocale) {
	const t = getDictionary(locale);

	switch (bucket) {
		case "overdue":
			return t.overdue;
		case "today":
			return t.today;
		case "tomorrow":
			return t.tomorrow;
		case "done":
			return t.done;
		default:
			return t.backlog;
	}
}

function formatTaskMeta(task: Task, locale: AppLocale) {
	const t = getDictionary(locale);

	if (task.completedAt) {
		return t.taskMetaDone(formatLocaleDateTime(task.completedAt, locale));
	}

	if (!task.plannedDate) {
		return t.noDate;
	}

	return formatLocaleDate(task.plannedDate, locale);
}

async function readMutationError(response: Response, fallback: string) {
	const payload = (await response.json().catch(() => null)) as
		| {error?: string}
		| null;

	throw new Error(payload?.error ?? fallback);
}

function resolveMutationMessage(
	error: unknown,
	authMessage: string,
	fallbackMessage: string,
) {
	const message =
		error instanceof Error ? error.message.toLowerCase() : "";

	if (
		message.includes("unauthorized") ||
		message.includes("auth.uid") ||
		message.includes("jwt")
	) {
		return authMessage;
	}

	return fallbackMessage;
}

export function TaskOrbitApp({
	initialData,
	initialLocale,
}: {
	initialData: DashboardData;
	initialLocale: AppLocale;
}) {
	const [projects, setProjects] = useState(initialData.projects);
	const [tasks, setTasks] = useState(initialData.tasks);
	const [locale, setLocale] = useState<AppLocale>(initialLocale);
	const [preferences, setPreferences] = useState<AppPreferences>(
		() => readStoredPreferences(initialData.weeklyRepeatWeekday),
	);
	const [activeScreen, setActiveScreen] = useState<AppScreen>("tasks");
	const [activeProjectId, setActiveProjectId] = useState(PROJECT_ALL_ID);
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
	const [composerOpen, setComposerOpen] = useState(false);
	const [projectSheetOpen, setProjectSheetOpen] = useState(false);
	const [resumeComposerAfterProjectSheet, setResumeComposerAfterProjectSheet] =
		useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [showReminder, setShowReminder] = useState(
		readStoredPreferences(initialData.weeklyRepeatWeekday).openReminderEnabled,
	);
	const [isTaskSaving, setIsTaskSaving] = useState(false);
	const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
	const [taskActionPrompt, setTaskActionPrompt] =
		useState<TaskActionPromptState | null>(null);
	const [isProjectSaving, setIsProjectSaving] = useState(false);
	const [isProjectDeleting, setIsProjectDeleting] = useState(false);
	const [isLocaleSaving, setIsLocaleSaving] = useState(false);
	const [isWeeklyRepeatDaySaving, setIsWeeklyRepeatDaySaving] = useState(false);
	const [isAuthRouting, setIsAuthRouting] = useState(false);
	const [composer, setComposer] = useState<ComposerState>({
		title: "",
		note: "",
		projectId: initialData.projects[0]?.id ?? "",
		bucket: "backlog",
		priority: "medium",
		repeatType: "none",
	});
	const [projectEditor, setProjectEditor] = useState<ProjectEditorState>(
		createProjectEditor(),
	);
	const deferredProjectId = useDeferredValue(activeProjectId);

	const filteredTasks = useMemo(() => {
		return deferredProjectId === PROJECT_ALL_ID
			? tasks
			: tasks.filter((task) => task.projectId === deferredProjectId);
	}, [deferredProjectId, tasks]);

	const groupedTasks = useMemo(
		() => groupTasks(filteredTasks),
		[filteredTasks],
	);
	const t = getDictionary(locale);
	const priorityOptions = [
		["low", t.low],
		["medium", t.med],
		["high", t.high],
	] as const;
	const groupedAllTasks = useMemo(() => groupTasks(tasks), [tasks]);
	const weekBuckets = useMemo(() => getWeekBuckets(tasks), [tasks]);
	const todayOpenCount = useMemo(() => countTodayOpenTasks(tasks), [tasks]);
	const isHomeScreen = activeScreen === "tasks";
	const selectedProject =
		deferredProjectId === PROJECT_ALL_ID
			? null
			: (projects.find((project) => project.id === deferredProjectId) ??
				null);

	const dismissReminder = useEffectEvent(() => {
		setShowReminder(false);
	});

	useEffect(() => {
		document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
	}, [locale]);

	useEffect(() => {
		if (!showReminder || todayOpenCount === 0) {
			return;
		}

		const timer = window.setTimeout(() => {
			dismissReminder();
		}, 4200);

		return () => {
			window.clearTimeout(timer);
		};
	}, [showReminder, todayOpenCount]);

	useEffect(() => {
		window.localStorage.setItem(
			APP_PREFERENCES_KEY,
			JSON.stringify(preferences),
		);
	}, [preferences]);

	useEffect(() => {
		if (!statusMessage) {
			return;
		}

		const timer = window.setTimeout(() => {
			setStatusMessage(null);
		}, 3200);

		return () => {
			window.clearTimeout(timer);
		};
	}, [statusMessage]);

	function requireWriteAccess(authMessage: string) {
		if (initialData.appIssue === "config-missing") {
			setStatusMessage(t.appUnavailableHint);
			return false;
		}

		if (!initialData.viewer.isAuthenticated) {
			setStatusMessage(authMessage);
			handleAuthRoute();
			return false;
		}

		if (initialData.appIssue === "load-failed") {
			setStatusMessage(t.loadFailedHint);
			return false;
		}

		return true;
	}

	async function handleLocaleChange(nextLocale: AppLocale) {
		setLocale(nextLocale);
		setIsLocaleSaving(true);
		try {
			await fetch("/api/locale", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({locale: nextLocale}),
			});
		} finally {
			setIsLocaleSaving(false);
		}
	}

	async function persistWeeklyRepeatWeekday(
		weeklyRepeatWeekday: WeeklyRepeatWeekday,
	) {
		const response = await fetch("/api/preferences", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({weeklyRepeatWeekday}),
		});

		if (!response.ok) {
			await readMutationError(response, "Unable to save preference");
		}
	}

	function getPreferredProjectId(fallbackProjectId?: string) {
		if (
			activeProjectId !== PROJECT_ALL_ID &&
			projects.some((project) => project.id === activeProjectId)
		) {
			return activeProjectId;
		}

		if (
			fallbackProjectId &&
			projects.some((project) => project.id === fallbackProjectId)
		) {
			return fallbackProjectId;
		}

		return projects[0]?.id ?? "";
	}

	function openTaskComposer(
		bucket: ComposerState["bucket"] = preferences.defaultTaskBucket,
	) {
		if (!requireWriteAccess(t.taskCreateAuth)) {
			return;
		}

		if (projects.length === 0) {
			openCreateProject();
			return;
		}

		setComposer({
			title: "",
			note: "",
			projectId: getPreferredProjectId(composer.projectId),
			bucket,
			priority: "medium",
			repeatType: "none",
		});
		setComposerOpen(true);
	}

	async function persistTaskUpdate(
		taskId: string,
		payload: TaskMutationPayload,
	) {
		const response = await fetch(`/api/tasks/${taskId}`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			await readMutationError(response, "Unable to update task");
		}

		const data = (await response.json()) as {task: Task};
		return data.task;
	}

	async function persistTaskCreate(payload: ComposerState) {
		const response = await fetch("/api/tasks", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			await readMutationError(response, "Unable to create task");
		}

		const data = (await response.json()) as {task: Task};
		return data.task;
	}

	async function persistProjectCreate(payload: ProjectEditorState) {
		const response = await fetch("/api/projects", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			await readMutationError(response, "Unable to create project");
		}

		const data = (await response.json()) as {project: Project};
		return data.project;
	}

	async function persistProjectUpdate(
		projectId: string,
		payload: ProjectEditorState,
	) {
		const response = await fetch(`/api/projects/${projectId}`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			await readMutationError(response, "Unable to update project");
		}

		const data = (await response.json()) as {project: Project};
		return data.project;
	}

	async function persistProjectDelete(projectId: string) {
		const response = await fetch(`/api/projects/${projectId}`, {
			method: "DELETE",
		});

		if (!response.ok) {
			await readMutationError(response, "Unable to delete project");
		}
	}

	async function handleTaskMove(
		taskId: string,
		bucket: NonNullable<TaskMutationPayload["bucket"]>,
		detail?: string,
	) {
		if (!requireWriteAccess(t.taskCreateAuth)) {
			return;
		}

		const previousTasks = tasks;
		const patch = buildTaskPatch(bucket);

		setStatusMessage(null);
		setMovingTaskId(taskId);
		setTasks((current) =>
			current.map((task) => (task.id === taskId ? {...task, ...patch} : task)),
		);

		try {
			const syncedTask = await persistTaskUpdate(taskId, {bucket, detail});
			setTasks((current) =>
				current.map((task) => (task.id === taskId ? syncedTask : task)),
			);
		} catch (error) {
			setTasks(previousTasks);
			setStatusMessage(
				resolveMutationMessage(error, t.taskCreateAuth, t.taskMoveFailed),
			);
		} finally {
			setMovingTaskId(null);
		}
	}

	async function handleRecurringTaskAction(
		taskId: string,
		action: "skip-today" | "pause-repeat",
		detail?: string,
	) {
		if (!requireWriteAccess(t.taskCreateAuth)) {
			return;
		}

		const previousTasks = tasks;

		setStatusMessage(null);
		setMovingTaskId(taskId);

		if (action === "skip-today") {
			setTasks((current) => current.filter((task) => task.id !== taskId));
		} else {
			setTasks((current) =>
				current.map((task) =>
					task.id === taskId ? {...task, repeatType: null, templateId: null} : task,
				),
			);
		}

		try {
			const syncedTask = await persistTaskUpdate(taskId, {action, detail});
			if (action === "skip-today") {
				setTasks((current) => current.filter((task) => task.id !== taskId));
			} else {
				setTasks((current) =>
					current.map((task) => (task.id === taskId ? syncedTask : task)),
				);
			}
		} catch (error) {
			setTasks(previousTasks);
			setStatusMessage(
				resolveMutationMessage(
					error,
					t.taskCreateAuth,
					action === "skip-today" ? t.taskSkipFailed : t.taskPauseFailed,
				),
			);
		} finally {
			setMovingTaskId(null);
		}
	}

	function openTaskActionPrompt(
		taskId: string,
		kind: TaskActionPromptState["kind"],
		mutation: TaskActionPromptState["mutation"],
	) {
		if (!requireWriteAccess(t.taskCreateAuth)) {
			return;
		}

		setTaskActionPrompt({
			taskId,
			kind,
			mutation,
		});
	}

	async function handleTaskActionPromptSubmit(detail: string) {
		if (!taskActionPrompt) {
			return;
		}

		const currentPrompt = taskActionPrompt;
		setTaskActionPrompt(null);

		if (currentPrompt.mutation.action) {
			await handleRecurringTaskAction(
				currentPrompt.taskId,
				currentPrompt.mutation.action,
				detail,
			);
			return;
		}

		if (currentPrompt.mutation.bucket) {
			await handleTaskMove(
				currentPrompt.taskId,
				currentPrompt.mutation.bucket,
				detail,
			);
		}
	}

	async function handleTaskCreate() {
		if (!composer.title.trim() || !composer.projectId) {
			return;
		}

		if (!requireWriteAccess(t.taskCreateAuth)) {
			return;
		}

		const optimisticTask: Task = {
			id: `local-${crypto.randomUUID()}`,
			projectId: composer.projectId,
			templateId:
				composer.repeatType === "none"
					? null
					: `local-template-${crypto.randomUUID()}`,
			title: composer.title.trim(),
			note: composer.note.trim() || undefined,
			priority: composer.priority,
			taskDate:
				composer.repeatType === "none"
					? buildTaskPatch(composer.bucket).plannedDate
					: format(new Date(), "yyyy-MM-dd"),
			repeatType:
				composer.repeatType === "none" ? null : composer.repeatType,
			isSkipped: false,
			createdAt: new Date().toISOString(),
			...buildTaskPatch(
				composer.repeatType === "none" ? composer.bucket : "today",
			),
		};

		setStatusMessage(null);
		setComposerOpen(false);
		setIsTaskSaving(true);
		setTasks((current) => [optimisticTask, ...current]);
		setComposer({
			title: "",
			note: "",
			projectId: getPreferredProjectId(composer.projectId),
			bucket: preferences.defaultTaskBucket,
			priority: "medium",
			repeatType: "none",
		});

		try {
			const syncedTask = await persistTaskCreate(composer);
			setTasks((current) =>
				current.map((task) =>
					task.id === optimisticTask.id ? syncedTask : task,
				),
			);
		} catch (error) {
			setTasks((current) =>
				current.filter((task) => task.id !== optimisticTask.id),
			);
			setStatusMessage(
				resolveMutationMessage(error, t.taskCreateAuth, t.taskCreateFailed),
			);
		} finally {
			setIsTaskSaving(false);
		}
	}

	function openCreateProject() {
		if (!requireWriteAccess(t.projectCreateAuth)) {
			return;
		}

		setProjectEditor(createProjectEditor());
		setResumeComposerAfterProjectSheet(false);
		setProjectSheetOpen(true);
	}

	function openEditProject(project: Project) {
		setProjectEditor(createProjectEditor(project));
		setResumeComposerAfterProjectSheet(false);
		setProjectSheetOpen(true);
	}

	function openInlineProjectCreate() {
		setProjectEditor(createProjectEditor());
		setResumeComposerAfterProjectSheet(true);
		setComposerOpen(false);
		setProjectSheetOpen(true);
	}

	function closeProjectSheet() {
		setProjectSheetOpen(false);

		if (resumeComposerAfterProjectSheet) {
			setComposerOpen(true);
			setResumeComposerAfterProjectSheet(false);
		}
	}

	function handleAuthRoute() {
		setIsAuthRouting(true);
		window.location.assign(
			initialData.viewer.isAuthenticated ? "/auth/sign-out" : "/login",
		);
	}

	async function handleWeeklyRepeatWeekdayChange(
		weeklyRepeatWeekday: WeeklyRepeatWeekday,
	) {
		if (!requireWriteAccess(t.taskCreateAuth)) {
			return;
		}

		const previousWeekday = preferences.weeklyRepeatWeekday;
		setStatusMessage(null);
		setIsWeeklyRepeatDaySaving(true);
		setPreferences((current) => ({
			...current,
			weeklyRepeatWeekday,
		}));

		try {
			await persistWeeklyRepeatWeekday(weeklyRepeatWeekday);
		} catch (error) {
			setPreferences((current) => ({
				...current,
				weeklyRepeatWeekday: previousWeekday,
			}));
			setStatusMessage(
				resolveMutationMessage(
					error,
					t.taskCreateAuth,
					t.cloudSyncFailed,
				),
			);
		} finally {
			setIsWeeklyRepeatDaySaving(false);
		}
	}

	async function handleProjectSave() {
		const name = projectEditor.name.trim();

		if (!name) {
			setStatusMessage(t.projectNameEmpty);
			return;
		}

		const previousProjects = projects;
		const previousActiveProjectId = activeProjectId;
		setStatusMessage(null);
		setProjectSheetOpen(false);
		setIsProjectSaving(true);

		if (projectEditor.id) {
			const projectId = projectEditor.id;
			const optimisticProject: Project = {
				id: projectId,
				name,
				color: projectEditor.color,
				icon: projectEditor.icon,
				status: projectEditor.status,
				sortOrder:
					projects.find((project) => project.id === projectId)
						?.sortOrder ?? 0,
			};

			setProjects((current) =>
				current.map((project) =>
					project.id === optimisticProject.id ? optimisticProject : project,
				),
			);

			try {
				const syncedProject = await persistProjectUpdate(projectId, {
					...projectEditor,
					name,
				});
				setProjects((current) =>
					current.map((project) =>
						project.id === syncedProject.id ? syncedProject : project,
					),
				);
			} catch (error) {
				setProjects(previousProjects);
				setStatusMessage(
					resolveMutationMessage(
						error,
						t.projectCreateAuth,
						t.projectUpdateFailed,
					),
				);
			} finally {
				setIsProjectSaving(false);
			}

			return;
		}

		const optimisticProject: Project = {
			id: `local-project-${crypto.randomUUID()}`,
			name,
			color: projectEditor.color,
			icon: projectEditor.icon,
			status: projectEditor.status,
			sortOrder: projects.length,
		};

		setProjects((current) => [...current, optimisticProject]);
		setActiveProjectId(optimisticProject.id);
		if (resumeComposerAfterProjectSheet) {
			setComposer((current) => ({
				...current,
				projectId: optimisticProject.id,
			}));
			setComposerOpen(true);
			setResumeComposerAfterProjectSheet(false);
		}

		try {
			const syncedProject = await persistProjectCreate({
				...projectEditor,
				name,
			});
			setProjects((current) =>
				current.map((project) =>
					project.id === optimisticProject.id ? syncedProject : project,
				),
			);
			setActiveProjectId(syncedProject.id);
			setComposer((current) =>
				current.projectId === optimisticProject.id
					? {...current, projectId: syncedProject.id}
					: current,
			);
		} catch (error) {
			setProjects(previousProjects);
			setActiveProjectId(previousActiveProjectId);
			if (resumeComposerAfterProjectSheet) {
				setComposerOpen(true);
				setResumeComposerAfterProjectSheet(false);
			}
			setStatusMessage(
				resolveMutationMessage(
					error,
					t.projectCreateAuth,
					t.projectCreateFailed,
				),
			);
		} finally {
			setIsProjectSaving(false);
		}
	}

	async function handleProjectDelete() {
		if (!projectEditor.id) {
			return;
		}

		if (!requireWriteAccess(t.projectCreateAuth)) {
			return;
		}

		const deletingProjectId = projectEditor.id;

		if (projects.length <= 1) {
			setStatusMessage(t.projectKeepOne);
			return;
		}

		const previousProjects = projects;
		const previousTasks = tasks;
		const previousActiveProjectId = activeProjectId;
		setStatusMessage(null);
		setProjectSheetOpen(false);
		setIsProjectDeleting(true);
		setProjects((current) =>
			current.filter((project) => project.id !== deletingProjectId),
		);
		setTasks((current) =>
			current.filter((task) => task.projectId !== deletingProjectId),
		);
		setSelectedTaskId(null);
		setComposer((current) => {
			if (current.projectId !== deletingProjectId) {
				return current;
			}

			const fallbackProject = projects.find(
				(project) => project.id !== deletingProjectId,
			);

			return {
				...current,
				projectId: fallbackProject?.id ?? "",
			};
		});

		if (activeProjectId === deletingProjectId) {
			setActiveProjectId(PROJECT_ALL_ID);
		}

		try {
			await persistProjectDelete(deletingProjectId);
		} catch {
			setProjects(previousProjects);
			setTasks(previousTasks);
			setActiveProjectId(previousActiveProjectId);
			setStatusMessage(t.projectDeleteFailed);
		} finally {
			setIsProjectDeleting(false);
		}
	}

	return (
		<main className="flex h-[100dvh] overflow-hidden items-start justify-center px-0 py-0 sm:min-h-screen sm:px-6 sm:py-10">
			<div className="device-shadow relative flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-background sm:h-[880px] sm:rounded-[2.15rem]">
				{statusMessage ? (
					<div className="pointer-events-none absolute inset-x-5 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 flex justify-center">
						<div className="rounded-[1rem] bg-[rgba(33,48,58,0.92)] px-4 py-3 text-sm font-medium text-white shadow-[0_10px_30px_rgba(17,24,28,0.18)] backdrop-blur-sm">
							{statusMessage}
						</div>
					</div>
				) : null}
				{isHomeScreen ? (
					<header className="safe-pt bg-background px-5 pb-3">
						<p className="text-base font-semibold text-foreground">
							{selectedProject?.name ?? t.all}
						</p>

						<div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
							<ProjectChip
								active={activeProjectId === PROJECT_ALL_ID}
								color="#31cc74"
								icon={<Layers3 className="h-4 w-4" />}
								label={t.all}
								onClick={() =>
									setActiveProjectId(PROJECT_ALL_ID)
								}
							/>
							{projects.map((project) => (
								<ProjectChip
									key={project.id}
									active={activeProjectId === project.id}
									color={project.color}
									icon={projectIcon(project.icon, "h-4 w-4")}
									label={project.name}
									onClick={() =>
										setActiveProjectId(project.id)
									}
								/>
							))}
						</div>

						{showReminder && todayOpenCount > 0 ? (
							<button
								className="pressable mt-3 flex w-full items-center justify-between rounded-2xl bg-[#edf8f1] px-4 py-3 text-left"
								onClick={() => setShowReminder(false)}
								type="button"
							>
								<div>
									<p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-strong">
										{t.today}
									</p>
									<p className="mt-1 text-sm font-semibold text-foreground">
										{todayOpenCount} {t.open}
									</p>
								</div>
								<ArrowUpRight className="h-4 w-4 text-accent-strong" />
							</button>
						) : null}
					</header>
				) : null}

				<section
					className={cn(
						"min-h-0 flex-1 overflow-y-auto bg-background px-5",
						isHomeScreen ? "pt-5" : "safe-pt pt-4",
					)}
					style={{ overscrollBehaviorY: "contain" }}
				>
					{initialData.appIssue && activeScreen !== "settings" ? (
						<AppIssueState
							issue={initialData.appIssue}
							locale={locale}
						/>
					) : null}

					{!initialData.appIssue && activeScreen === "tasks" ? (
						<TasksScreen
							groupedTasks={groupedTasks}
							locale={locale}
							movingTaskId={movingTaskId}
							onRequestAction={openTaskActionPrompt}
							onQuickAdd={(bucket) =>
								openTaskComposer(
									bucket === "today" ||
										bucket === "tomorrow" ||
										bucket === "backlog"
										? bucket
										: preferences.defaultTaskBucket,
								)
							}
							onMoveTask={handleTaskMove}
							preferredTodayLimit={
								preferences.preferredTodayLimit
							}
							selectedTaskId={selectedTaskId}
							setSelectedTaskId={setSelectedTaskId}
							showDoneColumn={preferences.showDoneColumn}
						/>
					) : null}

					{!initialData.appIssue && activeScreen === "projects" ? (
						<ProjectsScreen
							locale={locale}
							onCreateProject={openCreateProject}
							onEditProject={openEditProject}
							preferredTodayLimit={
								preferences.preferredTodayLimit
							}
							projects={projects}
							tasks={tasks}
						/>
					) : null}

					{!initialData.appIssue && activeScreen === "review" ? (
						<ReviewScreen
							groupedTasks={groupedAllTasks}
							locale={locale}
							preferredTodayLimit={
								preferences.preferredTodayLimit
							}
							projects={projects}
							tasks={tasks}
							weekBuckets={weekBuckets}
						/>
					) : null}

					{activeScreen === "settings" ? (
						<SettingsScreen
							isAuthRouting={isAuthRouting}
							isLocaleSaving={isLocaleSaving}
							isWeeklyRepeatDaySaving={isWeeklyRepeatDaySaving}
							onAuthRoute={handleAuthRoute}
							locale={locale}
							onDefaultBucketChange={(defaultTaskBucket) =>
								setPreferences((current) => ({
									...current,
									defaultTaskBucket,
								}))
							}
							onDoneColumnToggle={() =>
								setPreferences((current) => ({
									...current,
									showDoneColumn: !current.showDoneColumn,
								}))
							}
							onReminderToggle={() => {
								setPreferences((current) => ({
									...current,
									openReminderEnabled:
										!current.openReminderEnabled,
								}));
								setShowReminder((current) => !current);
							}}
							onTodayLimitChange={(preferredTodayLimit) =>
								setPreferences((current) => ({
									...current,
									preferredTodayLimit,
								}))
							}
							onLocaleChange={handleLocaleChange}
							onWeeklyRepeatWeekdayChange={
								handleWeeklyRepeatWeekdayChange
							}
							preferences={preferences}
							viewer={initialData.viewer}
						/>
					) : null}
				</section>

				<nav className="safe-pb relative z-10 flex items-end justify-between bg-[rgba(255,255,255,0.94)] px-5 pb-3 pt-2 backdrop-blur-md sm:rounded-b-[2.15rem]">
					<NavButton
						active={activeScreen === "tasks"}
						icon={<CheckCircle2 className="h-5 w-5" />}
						onClick={() => setActiveScreen("tasks")}
					/>
					<NavButton
						active={activeScreen === "projects"}
						icon={<FolderKanban className="h-5 w-5" />}
						onClick={() => setActiveScreen("projects")}
					/>
					<button
						className="pressable card-shadow -mt-7 flex h-[3.35rem] w-[3.35rem] items-center justify-center rounded-[1.15rem] bg-accent text-white disabled:pointer-events-none disabled:opacity-60"
						disabled={isTaskSaving || isProjectSaving}
						onClick={() => openTaskComposer()}
						type="button"
					>
						<Plus className="h-6 w-6" />
					</button>
					<NavButton
						active={activeScreen === "review"}
						icon={<CalendarDays className="h-5 w-5" />}
						onClick={() => setActiveScreen("review")}
					/>
					<NavButton
						active={activeScreen === "settings"}
						icon={<Settings className="h-5 w-5" />}
						onClick={() => setActiveScreen("settings")}
					/>
				</nav>

				{composerOpen ? (
					<div
						className="fixed inset-0 z-20 flex items-end justify-center bg-[rgba(28,40,54,0.28)] px-4 pb-0 pt-10"
						onClick={() => setComposerOpen(false)}
					>
						<div
							className="w-full max-w-[430px] rounded-t-[2rem] bg-surface px-5 pb-8 pt-5"
							onClick={(event) => event.stopPropagation()}
						>
							<div className="mx-auto h-1.5 w-14 rounded-full bg-border-soft" />
							<div className="mt-5 flex items-center justify-between">
								<div>
									<p className="text-sm font-semibold text-accent-strong">
										{t.new}
									</p>
									<h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-foreground">
										{t.task}
									</h2>
								</div>
								<button
									className="pressable rounded-xl bg-surface-soft px-3 py-2 text-sm font-semibold text-text-muted disabled:pointer-events-none disabled:opacity-60"
									disabled={isTaskSaving}
									onClick={() => setComposerOpen(false)}
									type="button"
								>
									{t.close}
								</button>
							</div>

							<fieldset
								className={cn("mt-5 space-y-4", isTaskSaving && "opacity-70")}
								disabled={isTaskSaving}
							>
								<label className="block">
									<span className="mb-2 block text-sm font-semibold text-foreground">
										{t.name}
									</span>
									<input
										className="w-full rounded-[1rem] bg-surface-soft px-4 py-4 text-base text-foreground outline-none transition focus:bg-[#eef4ef]"
										onChange={(event) =>
											setComposer((current) => ({
												...current,
												title: event.target.value,
											}))
										}
										placeholder={t.taskPlaceholder}
										value={composer.title}
									/>
								</label>

								<label className="block">
									<span className="mb-2 block text-sm font-semibold text-foreground">
										{t.note}
									</span>
									<textarea
										className="min-h-24 w-full resize-none rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-foreground outline-none transition focus:bg-[#eef4ef]"
										onChange={(event) =>
											setComposer((current) => ({
												...current,
												note: event.target.value,
											}))
										}
										placeholder={t.notePlaceholder}
										value={composer.note}
									/>
								</label>

								<div className="grid grid-cols-2 gap-4">
									<label className="block">
										<span className="mb-2 block text-sm font-semibold text-foreground">
											{t.project}
										</span>
									<select
											className="w-full rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-foreground outline-none"
											onChange={(event) => {
												if (
													event.target.value ===
													CREATE_PROJECT_OPTION
												) {
													openInlineProjectCreate();
													return;
												}

												setComposer((current) => ({
													...current,
													projectId:
														event.target.value,
												}));
											}}
											value={composer.projectId}
										>
											{projects.map((project) => (
												<option
													key={project.id}
													value={project.id}
												>
													{project.name}
												</option>
											))}
											<option value={CREATE_PROJECT_OPTION}>
												+ {t.new}
											</option>
										</select>
									</label>

									<label className="block">
										<span className="mb-2 block text-sm font-semibold text-foreground">
											{t.list}
										</span>
										<select
											className="w-full rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-foreground outline-none disabled:opacity-60"
											disabled={composer.repeatType !== "none"}
											onChange={(event) =>
												setComposer((current) => ({
													...current,
													bucket: event.target
														.value as ComposerState["bucket"],
												}))
											}
											value={composer.bucket}
										>
											<option value="backlog">
												{t.backlog}
											</option>
											<option value="today">
												{t.today}
											</option>
											<option value="tomorrow">
												{t.tomorrow}
											</option>
										</select>
									</label>
								</div>

								<label className="block">
									<span className="mb-2 block text-sm font-semibold text-foreground">
										{t.repeat}
									</span>
									<div className="grid grid-cols-3 rounded-[0.9rem] bg-surface-soft p-0.5">
										{([
											["none", t.none],
											["daily", t.daily],
											["weekly", t.weekly],
										] as const).map(([repeatType, label]) => (
											<SegmentButton
												key={repeatType}
												active={composer.repeatType === repeatType}
												label={label}
												onClick={() =>
													setComposer((current) => ({
														...current,
														repeatType,
														bucket:
															repeatType === "none"
																? current.bucket
																: "today",
													}))
												}
											/>
										))}
									</div>
								</label>

								<label className="block">
									<span className="mb-2 block text-sm font-semibold text-foreground">
										{t.priority}
									</span>
									<div className="grid grid-cols-3 rounded-[0.9rem] bg-surface-soft p-0.5">
										{priorityOptions.map(
											([priority, label]) => (
												<SegmentButton
													key={priority}
													active={
														composer.priority ===
														priority
													}
													label={label}
													onClick={() =>
														setComposer(
															(current) => ({
																...current,
																priority,
															}),
														)
													}
												/>
											),
										)}
									</div>
								</label>
							</fieldset>

							<button
								aria-busy={isTaskSaving}
								className="pressable mt-6 flex w-full items-center justify-center rounded-[1rem] bg-accent px-4 py-4 text-base font-semibold text-white disabled:pointer-events-none disabled:opacity-60"
								disabled={isTaskSaving}
								onClick={handleTaskCreate}
								type="button"
							>
								{isTaskSaving ? t.saving : t.save}
							</button>
						</div>
					</div>
				) : null}

				{projectSheetOpen ? (
					<div
						className="fixed inset-0 z-20 flex items-end justify-center bg-[rgba(28,40,54,0.28)] px-4 pb-0 pt-10"
						onClick={closeProjectSheet}
					>
						<div
							className="w-full max-w-[430px] rounded-t-[2rem] bg-surface px-5 pb-8 pt-5"
							onClick={(event) => event.stopPropagation()}
						>
							<div className="mx-auto h-1.5 w-14 rounded-full bg-border-soft" />
							<div className="mt-5 flex items-center justify-between">
								<div>
									<p className="text-sm font-semibold text-accent-strong">
										{t.project}
									</p>
									<h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-foreground">
										{projectEditor.id ? t.edit : t.new}
									</h2>
								</div>
								<button
									className="pressable rounded-xl bg-surface-soft px-3 py-2 text-sm font-semibold text-text-muted disabled:pointer-events-none disabled:opacity-60"
									disabled={isProjectSaving || isProjectDeleting}
									onClick={closeProjectSheet}
									type="button"
								>
									{t.close}
								</button>
							</div>

							<fieldset
								className={cn(
									"mt-5 space-y-4",
									(isProjectSaving || isProjectDeleting) && "opacity-70",
								)}
								disabled={isProjectSaving || isProjectDeleting}
							>
								<label className="block">
									<span className="mb-2 block text-sm font-semibold text-foreground">
										{t.name}
									</span>
									<input
										className="w-full rounded-[1rem] bg-surface-soft px-4 py-4 text-base text-foreground outline-none transition focus:bg-[#eef4ef]"
										onChange={(event) =>
											setProjectEditor((current) => ({
												...current,
												name: event.target.value,
											}))
										}
										placeholder={t.name}
										value={projectEditor.name}
									/>
								</label>

								<div>
									<span className="mb-2 block text-sm font-semibold text-foreground">
										{t.color}
									</span>
									<div className="flex gap-2">
										{PROJECT_COLOR_OPTIONS.map((color) => (
											<button
												key={color}
												className={cn(
													"pressable h-10 w-10 rounded-[0.9rem] transition",
													projectEditor.color ===
														color
														? "scale-105 shadow-[0_8px_18px_rgba(17,24,28,0.12)]"
														: "opacity-75",
												)}
												onClick={() =>
													setProjectEditor(
														(current) => ({
															...current,
															color,
														}),
													)
												}
												style={{backgroundColor: color}}
												type="button"
											/>
										))}
									</div>
								</div>

								<div>
									<span className="mb-2 block text-sm font-semibold text-foreground">
										{t.icon}
									</span>
									<div className="grid grid-cols-5 gap-2">
										{PROJECT_ICON_OPTIONS.map((icon) => (
											<button
												key={icon}
												className={cn(
													"pressable flex h-12 items-center justify-center rounded-[0.95rem] bg-surface-soft transition",
													projectEditor.icon === icon
														? "bg-[#eaf6ef] text-accent-strong"
														: "text-text-muted",
												)}
												onClick={() =>
													setProjectEditor(
														(current) => ({
															...current,
															icon,
														}),
													)
												}
												type="button"
											>
												{projectIcon(icon, "h-4 w-4")}
											</button>
										))}
									</div>
								</div>

								<div>
									<span className="mb-2 block text-sm font-semibold text-foreground">
										{t.status}
									</span>
									<div className="grid grid-cols-2 rounded-[0.9rem] bg-surface-soft p-0.5">
										<SegmentButton
											active={
												projectEditor.status ===
												"active"
											}
											label={t.active}
											onClick={() =>
												setProjectEditor((current) => ({
													...current,
													status: "active",
												}))
											}
										/>
										<SegmentButton
											active={
												projectEditor.status ===
												"paused"
											}
											label={t.pausedLabel}
											onClick={() =>
												setProjectEditor((current) => ({
													...current,
													status: "paused",
												}))
											}
										/>
									</div>
								</div>
							</fieldset>

							<button
								aria-busy={isProjectSaving}
								className="pressable mt-6 flex w-full items-center justify-center rounded-[1rem] bg-accent px-4 py-4 text-base font-semibold text-white disabled:pointer-events-none disabled:opacity-60"
								disabled={isProjectSaving || isProjectDeleting}
								onClick={handleProjectSave}
								type="button"
							>
								{isProjectSaving ? t.saving : t.save}
							</button>

							{projectEditor.id ? (
								<button
									aria-busy={isProjectDeleting}
									className="pressable mt-3 flex w-full items-center justify-center rounded-[1rem] bg-[#fff3f3] px-4 py-4 text-sm font-semibold text-danger disabled:pointer-events-none disabled:opacity-60"
									disabled={isProjectSaving || isProjectDeleting}
									onClick={handleProjectDelete}
									type="button"
								>
									{isProjectDeleting ? t.deleting : t.delete}
								</button>
							) : null}
						</div>
					</div>
				) : null}

				{taskActionPrompt ? (
					<TaskActionSheet
						isSubmitting={movingTaskId === taskActionPrompt.taskId}
						kind={taskActionPrompt.kind}
						locale={locale}
						onClose={() => setTaskActionPrompt(null)}
						onSubmit={handleTaskActionPromptSubmit}
					/>
				) : null}
			</div>
		</main>
	);
}

function TasksScreen({
	groupedTasks,
	locale,
	movingTaskId,
	onRequestAction,
	onQuickAdd,
	onMoveTask,
	preferredTodayLimit,
	selectedTaskId,
	setSelectedTaskId,
	showDoneColumn,
}: {
	groupedTasks: ReturnType<typeof groupTasks>;
	locale: AppLocale;
	movingTaskId: string | null;
	onRequestAction: (
		taskId: string,
		kind: TaskActionPromptState["kind"],
		mutation: TaskMutationPayload,
	) => void;
	onQuickAdd: (bucket: TaskBucket) => void;
	onMoveTask: (
		taskId: string,
		bucket: NonNullable<TaskMutationPayload["bucket"]>,
		detail?: string,
	) => void;
	preferredTodayLimit: number;
	selectedTaskId: string | null;
	setSelectedTaskId: (taskId: string | null) => void;
	showDoneColumn: boolean;
}) {
	const t = getDictionary(locale);
	const sections = useMemo(
		() =>
			showDoneColumn
				? (["overdue", "today", "tomorrow", "backlog", "done"] as TaskBucket[])
				: (["overdue", "today", "tomorrow", "backlog"] as TaskBucket[]),
		[showDoneColumn],
	);
	const todayCount = groupedTasks.today.length;
	const overdueCount = groupedTasks.overdue.length;
	const slotsRemaining = Math.max(preferredTodayLimit - todayCount, 0);
	const todayMessage =
		overdueCount > 0
			? t.todayMessageOverdue(overdueCount)
			: todayCount === 0
				? t.empty
				: todayCount > preferredTodayLimit
					? t.todayMessageOver(todayCount - preferredTodayLimit)
					: t.todayMessageLeft(slotsRemaining);
	const defaultBucket = (overdueCount > 0 ? "overdue" : "today") as TaskBucket;
	const loopedSections = useMemo(
		() => [sections[sections.length - 1], ...sections, sections[0]],
		[sections],
	);
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const touchStartXRef = useRef<number | null>(null);
	const touchStartTrackIndexRef = useRef<number | null>(null);
	const resetTimerRef = useRef<number | null>(null);
	const unlockTimerRef = useRef<number | null>(null);
	const programmaticScrollRef = useRef(false);
	const [viewportWidth, setViewportWidth] = useState(0);
	const [trackIndex, setTrackIndex] = useState(
		sections.indexOf(defaultBucket) + 1,
	);
	const [indicatorPosition, setIndicatorPosition] = useState(
		sections.indexOf(defaultBucket),
	);
	const trackIndexRef = useRef(trackIndex);
	const CARD_GAP = 12;
	const trackStep = viewportWidth > 0 ? viewportWidth + CARD_GAP : 0;
	const activeBucketIndex = (() => {
		const normalized =
			((indicatorPosition % sections.length) + sections.length) %
			sections.length;
		const integerPart = Math.floor(normalized);
		const fraction = normalized - integerPart;

		return fraction >= 0.15
			? (integerPart + 1) % sections.length
			: integerPart;
	})();
	const activeBucket = sections[activeBucketIndex] ?? defaultBucket;
	const commitTrackState = useCallback(
		(
			nextIndex: number,
			nextIndicator = nextIndex - 1,
			syncIndicator = true,
		) => {
			trackIndexRef.current = nextIndex;
			setTrackIndex(nextIndex);
			if (syncIndicator) {
				setIndicatorPosition(nextIndicator);
			}
		},
		[],
	);

	useEffect(() => {
		const node = viewportRef.current;

		if (!node) {
			return;
		}

		const syncWidth = () => {
			setViewportWidth(node.getBoundingClientRect().width);
		};

		syncWidth();
		const observer = new ResizeObserver(syncWidth);
		observer.observe(node);

		return () => {
			observer.disconnect();
		};
	}, []);

	useEffect(() => {
		const node = viewportRef.current;

		if (!node || trackStep === 0) {
			return;
		}

		programmaticScrollRef.current = true;
		node.scrollTo({
			left: Math.min(trackIndexRef.current, sections.length) * trackStep,
			behavior: "auto",
		});

		const unlockId = window.setTimeout(() => {
			programmaticScrollRef.current = false;
		}, 60);
		unlockTimerRef.current = unlockId;

		return () => {
			window.clearTimeout(unlockId);
		};
	}, [sections.length, trackStep]);

	useEffect(() => {
		return () => {
			if (resetTimerRef.current !== null) {
				window.clearTimeout(resetTimerRef.current);
			}

			if (unlockTimerRef.current !== null) {
				window.clearTimeout(unlockTimerRef.current);
			}
		};
	}, []);

	const scrollToTrackIndex = useCallback(
		(nextIndex: number, behavior: ScrollBehavior = "smooth") => {
			const node = viewportRef.current;

			if (!node || trackStep === 0) {
				return;
			}

			if (unlockTimerRef.current !== null) {
				window.clearTimeout(unlockTimerRef.current);
			}

			programmaticScrollRef.current = true;
			commitTrackState(nextIndex, nextIndex - 1, false);
			node.scrollTo({
				left: nextIndex * trackStep,
				behavior,
			});

			const unlockId = window.setTimeout(() => {
				programmaticScrollRef.current = false;
			}, behavior === "smooth" ? 320 : 60);
			unlockTimerRef.current = unlockId;
		},
		[commitTrackState, trackStep],
	);

	const handleViewportScroll = useCallback(() => {
		const node = viewportRef.current;

		if (!node || trackStep === 0) {
			return;
		}

		const rawIndex = node.scrollLeft / trackStep;
		let logicalPosition = rawIndex - 1;

		if (logicalPosition < -0.5) {
			logicalPosition += sections.length;
		}

		if (logicalPosition > sections.length - 0.5) {
			logicalPosition -= sections.length;
		}

		setIndicatorPosition(logicalPosition);

		const roundedIndex = Math.round(rawIndex);
		const normalizedIndex =
			roundedIndex <= 0
				? sections.length
				: roundedIndex > sections.length
					? 1
					: roundedIndex;

		trackIndexRef.current = normalizedIndex;
		setTrackIndex(normalizedIndex);

		if (resetTimerRef.current !== null) {
			window.clearTimeout(resetTimerRef.current);
		}

		resetTimerRef.current = window.setTimeout(() => {
			const latestNode = viewportRef.current;

			if (!latestNode) {
				return;
			}

			const settledIndex = latestNode.scrollLeft / trackStep;

			if (settledIndex <= 0.5) {
				scrollToTrackIndex(sections.length, "auto");
				return;
			}

			if (settledIndex >= sections.length + 0.5) {
				scrollToTrackIndex(1, "auto");
				return;
			}

			const finalIndex = Math.round(settledIndex);
			commitTrackState(finalIndex);
			programmaticScrollRef.current = false;
		}, 90);
	}, [commitTrackState, scrollToTrackIndex, sections.length, trackStep]);

	return (
		<div className="-mx-5 space-y-4">
			<div className="px-5">
				<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
					{t.today}
				</p>
				<div className="mt-1 flex items-end justify-between gap-3">
					<h2 className="text-xl font-semibold tracking-[-0.05em] text-foreground">
						{todayCount}/{preferredTodayLimit}
					</h2>
					<p className="text-sm text-text-muted">{todayMessage}</p>
				</div>
			</div>

			<div className="px-5">
				<div className="relative mt-0.5 grid" style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}>
					<div className="absolute inset-x-0 bottom-0 h-px bg-surface-soft" />
					<div
						className="pointer-events-none absolute bottom-0 z-10"
						style={{
							width: `${100 / sections.length}%`,
							transform: `translateX(${indicatorPosition * 100}%)`,
						}}
					>
						<div className="mx-auto h-[2px] w-6 rounded-full bg-accent" />
					</div>
					{sections.map((bucket) => (
						<BucketTab
							key={bucket}
							active={activeBucket === bucket}
							label={formatBucketLabel(bucket, locale)}
							onClick={() => {
								setSelectedTaskId(null);
								scrollToTrackIndex(
									sections.indexOf(bucket) + 1,
								);
							}}
						/>
					))}
				</div>

				<div
					ref={viewportRef}
					className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
					onScroll={handleViewportScroll}
					onTouchEnd={(event) => {
						const startX = touchStartXRef.current;
						const startTrackIndex = touchStartTrackIndexRef.current;
						const endX = event.changedTouches[0]?.clientX;
						touchStartXRef.current = null;
						touchStartTrackIndexRef.current = null;

						if (
							startX === null ||
							startTrackIndex === null ||
							typeof endX !== "number" ||
							viewportWidth === 0
						) {
							return;
						}

						const deltaX = endX - startX;
						const threshold = viewportWidth * 0.15;

						if (Math.abs(deltaX) < threshold) {
							scrollToTrackIndex(startTrackIndex);
							return;
						}

						const nextIndex =
							deltaX < 0 ? startTrackIndex + 1 : startTrackIndex - 1;
						scrollToTrackIndex(nextIndex);
						setSelectedTaskId(null);
					}}
					onTouchStart={(event) => {
						touchStartXRef.current =
							event.touches[0]?.clientX ?? null;
						touchStartTrackIndexRef.current = trackIndexRef.current;
					}}
					style={{ overscrollBehaviorX: "contain" }}
				>
					{loopedSections.map((bucket, index) => (
						<div
							key={`${bucket}-${index}`}
							className="shrink-0 snap-center"
							style={{
								width: viewportWidth > 0 ? `${viewportWidth}px` : "100%",
							}}
						>
							<TaskBucketCard
								bucket={bucket}
								locale={locale}
								movingTaskId={movingTaskId}
								onRequestAction={onRequestAction}
								onMoveTask={onMoveTask}
								onQuickAdd={onQuickAdd}
								selectedTaskId={selectedTaskId}
								setSelectedTaskId={setSelectedTaskId}
								tasks={groupedTasks[bucket]}
							/>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function TaskBucketCard({
	bucket,
	locale,
	movingTaskId,
	onRequestAction,
	onMoveTask,
	onQuickAdd,
	selectedTaskId,
	setSelectedTaskId,
	tasks,
}: {
	bucket: TaskBucket;
	locale: AppLocale;
	movingTaskId: string | null;
	onRequestAction: (
		taskId: string,
		kind: TaskActionPromptState["kind"],
		mutation: TaskMutationPayload,
	) => void;
	onMoveTask: (
		taskId: string,
		bucket: NonNullable<TaskMutationPayload["bucket"]>,
		detail?: string,
	) => void;
	onQuickAdd: (bucket: TaskBucket) => void;
	selectedTaskId: string | null;
	setSelectedTaskId: (taskId: string | null) => void;
	tasks: Task[];
}) {
	const t = getDictionary(locale);
	const quickAddBucket =
		bucket === "today" || bucket === "tomorrow" || bucket === "backlog"
			? bucket
			: "backlog";
	const emptyHint =
		bucket === "overdue"
			? t.emptyOverdueHint
			: bucket === "today"
				? t.emptyTodayHint
				: bucket === "tomorrow"
					? t.emptyTomorrowHint
					: bucket === "done"
						? t.emptyDoneHint
						: t.emptyBacklogHint;

	return (
		<section
			className={cn(
				"flex min-h-[31rem] min-w-0 flex-col rounded-[1.25rem] px-3.5 py-3.5 shadow-[0_6px_20px_rgba(17,24,28,0.03)]",
				bucket === "overdue"
					? "bg-[#ede8e4]"
					: bucket === "done"
						? "bg-[#eaede6]"
						: "bg-[#e7ebe3]",
			)}
		>
			<div className="flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
				<div className="space-y-2.5 pb-3">
					{tasks.length === 0 ? (
						<InlineEmptyState
							hint={emptyHint}
						/>
					) : null}

					{tasks.map((task) => {
						const expanded = selectedTaskId === task.id;
						const isMoving = movingTaskId === task.id;

						return (
							<article
								key={task.id}
								className={cn(
									"rounded-[1rem] bg-white transition",
									bucket === "overdue" && !expanded && "bg-[#fff7f5]",
									bucket === "done" && !expanded && "bg-[#fbfcfa]",
								)}
							>
								<button
									className="pressable-row flex w-full items-start gap-3 rounded-[1rem] px-3.5 py-3 text-left disabled:pointer-events-none disabled:opacity-60"
									disabled={isMoving}
									onClick={() =>
										setSelectedTaskId(expanded ? null : task.id)
									}
									type="button"
								>
									<span className="min-w-0 flex-1">
										<span className="flex items-start justify-between gap-3">
											<span>
												<span className="block text-[12px] font-semibold leading-5 text-foreground">
													{task.title}
												</span>
												<span className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
													<span>{formatTaskMeta(task, locale)}</span>
													{task.repeatType ? (
														<span className="rounded-md bg-surface-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-accent-strong">
															{task.repeatType === "daily"
																? t.daily
																: t.weekly}
														</span>
													) : null}
												</span>
											</span>
											<Link
												aria-label={t.openDetails(task.title)}
												className="pressable rounded-md p-0.5 text-text-soft"
												href={`/tasks/${task.id}`}
												onClick={(event) => event.stopPropagation()}
											>
												<ChevronRight className="h-3.5 w-3.5" />
											</Link>
										</span>
									</span>
								</button>

								{expanded ? (
									<div className="grid grid-cols-3 rounded-b-[1rem] bg-[#eef1ea] text-[11px] font-semibold">
										{task.repeatType ? (
											<>
												<ActionButton
													accent={bucket === "done" ? "neutral" : "success"}
													disabled={isMoving}
													label={bucket === "done" ? t.today : t.done}
													pending={isMoving}
													pendingLabel={t.moving}
													onClick={() =>
														bucket === "done"
															? onMoveTask(task.id, "today")
															: onRequestAction(task.id, "done", {bucket: "done"})
													}
												/>
												<ActionButton
													accent="neutral"
													disabled={isMoving}
													label={t.skip}
													pending={isMoving}
													pendingLabel={t.moving}
													onClick={() =>
														onRequestAction(task.id, "skip", {
															action: "skip-today",
														})
													}
												/>
												<ActionButton
													accent="danger"
													disabled={isMoving}
													label={t.pause}
													pending={isMoving}
													pendingLabel={t.moving}
													onClick={() =>
														onRequestAction(task.id, "pause", {
															action: "pause-repeat",
														})
													}
												/>
											</>
										) : (
											<>
												<ActionButton
													accent="success"
													disabled={bucket === "today" || isMoving}
													label={t.today}
													pending={isMoving}
													pendingLabel={t.moving}
													onClick={() => onMoveTask(task.id, "today")}
												/>
												<ActionButton
													accent="neutral"
													disabled={bucket === "tomorrow" || isMoving}
													label={t.tomorrow}
													pending={isMoving}
													pendingLabel={t.moving}
													onClick={() => onMoveTask(task.id, "tomorrow")}
												/>
												<ActionButton
													accent={bucket === "done" ? "neutral" : "danger"}
													disabled={isMoving}
													label={bucket === "done" ? t.backlog : t.done}
													pending={isMoving}
													pendingLabel={t.moving}
													onClick={() =>
														bucket === "done"
															? onMoveTask(task.id, "backlog")
															: onRequestAction(task.id, "done", {bucket: "done"})
													}
												/>
											</>
										)}
									</div>
								) : null}
							</article>
						);
					})}
				</div>
			</div>

			<button
				aria-label={t.add}
				className="pressable ml-auto mt-2 flex h-8 w-8 items-center justify-center rounded-[0.8rem] text-text-muted transition hover:text-accent-strong"
				onClick={() => onQuickAdd(quickAddBucket)}
				type="button"
			>
				<Plus className="h-4 w-4" />
			</button>
		</section>
	);
}

function TaskActionSheet({
	isSubmitting,
	kind,
	locale,
	onClose,
	onSubmit,
}: {
	isSubmitting: boolean;
	kind: TaskActionPromptState["kind"];
	locale: AppLocale;
	onClose: () => void;
	onSubmit: (detail: string) => void;
}) {
	const t = getDictionary(locale);
	const [detail, setDetail] = useState("");
	const label =
		kind === "done"
			? t.doneNote
			: kind === "skip"
				? t.skipReason
				: t.pauseReason;
	const placeholder =
		kind === "done"
			? t.doneNotePlaceholder
			: kind === "skip"
				? t.skipReasonPlaceholder
				: t.pauseReasonPlaceholder;
	const actionLabel =
		kind === "done"
			? t.done
			: kind === "skip"
				? t.skip
				: t.pause;

	return (
		<div
			className="fixed inset-0 z-20 flex items-end justify-center bg-[rgba(28,40,54,0.28)] px-4 pb-0 pt-10"
			onClick={onClose}
		>
			<div
				className="w-full max-w-[430px] rounded-t-[2rem] bg-surface px-5 pb-8 pt-5"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="mx-auto h-1.5 w-14 rounded-full bg-border-soft" />
				<div className="mt-5 flex items-center justify-between">
					<div>
						<p className="text-sm font-semibold text-accent-strong">{actionLabel}</p>
						<h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-foreground">
							{label}
						</h2>
					</div>
					<button
						className="pressable rounded-xl bg-surface-soft px-3 py-2 text-sm font-semibold text-text-muted disabled:pointer-events-none disabled:opacity-60"
						disabled={isSubmitting}
						onClick={onClose}
						type="button"
					>
						{t.close}
					</button>
				</div>

				<label className="mt-5 block">
					<span className="mb-2 block text-sm font-semibold text-foreground">{label}</span>
					<textarea
						autoFocus
						className="min-h-28 w-full resize-none rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-foreground outline-none transition focus:bg-[#eef4ef]"
						onChange={(event) => setDetail(event.target.value)}
						placeholder={placeholder}
						value={detail}
					/>
				</label>

				<button
					aria-busy={isSubmitting}
					className="pressable mt-6 flex w-full items-center justify-center rounded-[1rem] bg-accent px-4 py-4 text-base font-semibold text-white disabled:pointer-events-none disabled:opacity-60"
					disabled={isSubmitting || !detail.trim()}
					onClick={() => onSubmit(detail.trim())}
					type="button"
				>
					{isSubmitting ? t.submitting : t.save}
				</button>
			</div>
		</div>
	);
}

function ProjectsScreen({
	locale,
	onCreateProject,
	onEditProject,
	preferredTodayLimit,
	projects,
	tasks,
}: {
	locale: AppLocale;
	onCreateProject: () => void;
	onEditProject: (project: Project) => void;
	preferredTodayLimit: number;
	projects: Project[];
	tasks: Task[];
}) {
	const t = getDictionary(locale);
	const activeProjects = projects.filter(
		(project) => project.status === "active",
	).length;
	const pausedProjects = projects.length - activeProjects;
	const totalOverdue = tasks.filter(
		(task) => getTaskBucket(task) === "overdue",
	).length;
	const totalToday = tasks.filter(
		(task) => getTaskBucket(task) === "today",
	).length;
	const totalBacklog = tasks.filter(
		(task) => getTaskBucket(task) === "backlog",
	).length;
	const rankedProjects = [...projects].sort((left, right) => {
		const leftStats = getProjectStats(left, tasks);
		const rightStats = getProjectStats(right, tasks);
		const leftBacklog = tasks.filter(
			(task) =>
				task.projectId === left.id && getTaskBucket(task) === "backlog",
		).length;
		const rightBacklog = tasks.filter(
			(task) =>
				task.projectId === right.id &&
				getTaskBucket(task) === "backlog",
		).length;

		return (
			Number(right.status === "active") -
				Number(left.status === "active") ||
			rightStats.overdue - leftStats.overdue ||
			rightStats.today - leftStats.today ||
			rightBacklog - leftBacklog
		);
	});

	return (
		<div className="space-y-5">
			<div>
				<h1 className="text-lg font-semibold tracking-[-0.04em] text-foreground">
					{t.projects}
				</h1>
				<p className="mt-1 text-sm text-text-muted">
					{totalToday} {t.today} · {totalOverdue} {t.overdue} · {t.paused(pausedProjects)}
				</p>
			</div>

			<section className="grid grid-cols-2 gap-3">
				<CompactMetric label={t.active} value={activeProjects} />
				<CompactMetric label={t.today} value={totalToday} />
				<CompactMetric label={t.overdue} value={totalOverdue} />
				<CompactMetric label={t.backlog} value={totalBacklog} />
			</section>

			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm font-semibold text-foreground">
						{t.projectList}
					</p>
					<p className="mt-1 text-[12px] text-text-muted">
						{t.projectListHint(activeProjects, pausedProjects)}
					</p>
				</div>
				<button
					className="pressable inline-flex items-center gap-2 rounded-[0.9rem] bg-accent px-4 py-2.5 text-sm font-semibold text-white"
					onClick={onCreateProject}
					type="button"
				>
					<Plus className="h-4 w-4" />
					{t.new}
				</button>
			</div>

			<div className="overflow-hidden rounded-[1.05rem] bg-surface-muted">
				{rankedProjects.length === 0 ? (
					<div className="px-4 py-4">
						<InlineEmptyState
							hint={t.emptyProjectsHint}
						/>
					</div>
				) : null}
				{rankedProjects.map((project) => {
					const stats = getProjectStats(project, tasks);
					const backlog = tasks.filter(
						(task) =>
							task.projectId === project.id &&
							getTaskBucket(task) === "backlog",
					).length;
					const openCount = stats.total - stats.done;
					const needsAttention = stats.overdue > 0;
					const overLimit = stats.today > preferredTodayLimit;
					const statusCopy = needsAttention
						? t.projectStatusOverdue(stats.overdue)
						: overLimit
							? t.projectStatusToday(stats.today)
							: stats.today > 0
								? t.projectStatusToday(stats.today)
								: backlog > 0
									? t.projectStatusBacklog(backlog)
									: t.clear;

					return (
						<div key={project.id}>
							<div className="px-4 py-4">
								<div className="flex items-start justify-between gap-3">
									<div className="flex min-w-0 items-center gap-3">
										<span
											className="flex h-10 w-10 items-center justify-center rounded-[0.9rem]"
											style={{
												backgroundColor: `${project.color}1A`,
												color: project.color,
											}}
										>
											{projectIcon(project.icon, "h-4 w-4")}
										</span>
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<h2 className="truncate text-sm font-semibold text-foreground">
													{project.name}
												</h2>
												<span
													className={cn(
														"shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
														project.status === "active"
															? "bg-surface text-accent-strong"
															: "bg-surface text-text-muted",
													)}
												>
													{project.status === "active"
														? t.active
														: t.pausedLabel}
												</span>
											</div>
											<p className="mt-1 text-[12px] leading-5 text-text-muted">
												{statusCopy}
											</p>
										</div>
									</div>
									<button
										aria-label={`${t.edit} ${project.name}`}
										className="pressable flex h-8 w-8 items-center justify-center rounded-[0.8rem] bg-surface text-text-muted"
										onClick={() => onEditProject(project)}
										type="button"
									>
										<Pencil className="h-4 w-4" />
									</button>
								</div>

								<div className="mt-3 grid grid-cols-4 gap-2">
									<ProjectStat
										label={t.today}
										tone={overLimit ? "warning" : "default"}
										value={stats.today}
									/>
									<ProjectStat
										label={t.overdue}
										tone={needsAttention ? "danger" : "default"}
										value={stats.overdue}
									/>
									<ProjectStat
										label={t.backlog}
										value={backlog}
									/>
									<ProjectStat
										label={t.done}
										value={stats.done}
									/>
								</div>

								<div className="mt-3 flex items-center justify-between text-[11px]">
									<p className="text-text-muted">{t.projectOpen(openCount)}</p>
									<p
										className={cn(
											"font-semibold",
											needsAttention
												? "text-danger"
												: overLimit
													? "text-[#b7832f]"
													: "text-accent-strong",
										)}
									>
										{needsAttention
											? t.risk
											: overLimit
												? t.full
												: t.ok}
									</p>
								</div>
							</div>
							{project.id !==
							rankedProjects[rankedProjects.length - 1]?.id ? (
								<div className="mx-4 h-px bg-surface-soft" />
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ReviewScreen({
	groupedTasks,
	locale,
	preferredTodayLimit,
	projects,
	tasks,
	weekBuckets,
}: {
	groupedTasks: ReturnType<typeof groupTasks>;
	locale: AppLocale;
	preferredTodayLimit: number;
	projects: Project[];
	tasks: Task[];
	weekBuckets: ReturnType<typeof getWeekBuckets>;
}) {
	const t = getDictionary(locale);
	const doneThisWeek = weekBuckets.reduce(
		(total, bucket) => total + bucket.doneCount,
		0,
	);
	const plannedThisWeek = weekBuckets.reduce(
		(total, bucket) => total + bucket.plannedCount,
		0,
	);
	const weeklyHitRate = plannedThisWeek
		? Math.round((doneThisWeek / plannedThisWeek) * 100)
		: 0;
	const totalOverdue = groupedTasks.overdue.length;
	const totalToday = groupedTasks.today.length;
	const totalTomorrow = groupedTasks.tomorrow.length;
	const totalBacklog = groupedTasks.backlog.length;
	const doneAllTime = groupedTasks.done.length;
	const attentionProjects = [...projects]
		.map((project) => {
			const stats = getProjectStats(project, tasks);
			const backlog = tasks.filter(
				(task) =>
					task.projectId === project.id &&
					getTaskBucket(task) === "backlog",
			).length;

			return {project, stats, backlog};
		})
		.filter(
			({stats, backlog}) =>
				stats.overdue > 0 || stats.today > 0 || backlog > 0,
		)
		.sort(
			(left, right) =>
				right.stats.overdue - left.stats.overdue ||
				right.stats.today - left.stats.today ||
				right.backlog - left.backlog,
		)
		.slice(0, 5);

	return (
		<div className="space-y-5">
			<div>
				<h1 className="text-lg font-semibold tracking-[-0.04em] text-foreground">
					{t.review}
				</h1>
				<p className="mt-1 text-sm text-text-muted">
					{doneThisWeek} {t.done} · {weeklyHitRate}% {t.hit}
				</p>
			</div>

			<section className="grid grid-cols-2 gap-3">
				<CompactMetric
					label={t.today}
					value={t.statsToday(totalToday, preferredTodayLimit)}
				/>
				<CompactMetric label={t.overdue} value={totalOverdue} />
				<CompactMetric label={t.hit} value={`${weeklyHitRate}%`} />
				<CompactMetric label={t.done} value={doneThisWeek} />
			</section>

			<section className="rounded-[1rem] bg-surface-muted px-4 py-4">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-medium text-foreground">
							{t.week}
						</p>
						<p className="mt-1 text-[12px] text-text-muted">
							{t.planDone(plannedThisWeek, doneThisWeek)}
						</p>
					</div>
					<p className="text-sm font-medium text-foreground">
						{totalTomorrow} {t.next}
					</p>
				</div>

				<div className="mt-4 grid grid-cols-7 gap-1.5">
					{weekBuckets.map((bucket) => (
						<div
							key={bucket.date}
							className={cn(
								"rounded-[0.85rem] px-2 py-2.5",
								bucket.isToday ? "bg-surface text-foreground" : "bg-transparent",
							)}
						>
							<p className="text-[10px] font-medium text-text-soft">
								{formatLocaleWeekday(bucket.date, locale)}
							</p>
							<p className="mt-1.5 text-sm font-semibold text-foreground">
								{bucket.dayNumber}
							</p>
							<p className="mt-1.5 text-[10px] text-text-muted">
								{bucket.plannedCount} {t.due}
							</p>
							<p className="text-[10px] text-accent-strong">
								{bucket.doneCount} {t.done}
							</p>
						</div>
					))}
				</div>
			</section>

			<section className="space-y-3">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-semibold text-foreground">
							{t.queue}
						</p>
					</div>
					<p className="text-sm font-semibold text-foreground">
						{totalBacklog} {t.backlog}
					</p>
				</div>

				{attentionProjects.length === 0 ? (
					<div className="rounded-[1rem] bg-surface-muted px-4 py-4">
						<InlineEmptyState
							hint={t.emptyQueueHint}
						/>
					</div>
				) : (
					<div className="overflow-hidden rounded-[1rem] bg-surface-muted">
						{attentionProjects.map(({backlog, project, stats}, index) => (
							<div key={project.id}>
								<div className="flex items-center justify-between gap-4 px-4 py-3.5">
									<div className="flex min-w-0 items-center gap-3">
										<span
											className="flex h-8 w-8 items-center justify-center rounded-[0.85rem]"
											style={{
												backgroundColor: `${project.color}1A`,
												color: project.color,
											}}
										>
											{projectIcon(project.icon, "h-4 w-4")}
										</span>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium text-foreground">
												{project.name}
											</p>
											<p className="mt-0.5 text-[12px] text-text-muted">
												{stats.overdue > 0
													? t.attentionOverdue(stats.overdue)
													: stats.today > preferredTodayLimit
														? t.attentionToday(stats.today)
														: t.attentionBacklog(backlog)}
											</p>
										</div>
									</div>
									<div className="shrink-0 text-right text-[12px] text-text-muted">
										<p>{stats.today} {t.today}</p>
										<p>{backlog} {t.backlog}</p>
									</div>
								</div>
								{index !== attentionProjects.length - 1 ? (
									<div className="mx-4 h-px bg-surface-soft" />
								) : null}
							</div>
						))}
					</div>
				)}
			</section>

			<section className="grid grid-cols-2 gap-3">
				<CompactMetric label={t.total} value={doneAllTime} />
				<CompactMetric label={t.next} value={totalTomorrow} />
			</section>
		</div>
	);
}

function SettingsScreen({
	isAuthRouting,
	isLocaleSaving,
	isWeeklyRepeatDaySaving,
	locale,
	onAuthRoute,
	onDefaultBucketChange,
	onDoneColumnToggle,
	onLocaleChange,
	onReminderToggle,
	onTodayLimitChange,
	onWeeklyRepeatWeekdayChange,
	preferences,
	viewer,
}: {
	isAuthRouting: boolean;
	isLocaleSaving: boolean;
	isWeeklyRepeatDaySaving: boolean;
	locale: AppLocale;
	onAuthRoute: () => void;
	onDefaultBucketChange: (bucket: ComposerState["bucket"]) => void;
	onDoneColumnToggle: () => void;
	onLocaleChange: (locale: AppLocale) => void;
	onReminderToggle: () => void;
	onTodayLimitChange: (limit: (typeof TODAY_LIMIT_OPTIONS)[number]) => void;
	onWeeklyRepeatWeekdayChange: (
		weekday: WeeklyRepeatWeekday,
	) => void;
	preferences: AppPreferences;
	viewer: DashboardData["viewer"];
}) {
	const t = getDictionary(locale);
	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div className="overflow-hidden rounded-[1rem] bg-surface">
					<div className="flex items-start justify-between gap-4 px-4 py-4">
						<div>
							<p className="text-lg font-semibold tracking-[-0.04em] text-foreground">
								{t.account}
							</p>
							<p className="mt-2 text-sm font-medium text-foreground">
								{viewer.isAuthenticated
									? viewer.label
									: t.accountSignedOut}
							</p>
							<p className="mt-1 text-sm leading-6 text-text-muted">
								{viewer.isAuthenticated
									? viewer.email
									: t.settingsSyncHint}
							</p>
						</div>
						{viewer.isAuthenticated ? (
							<button
								aria-busy={isAuthRouting}
								className="pressable inline-flex items-center rounded-[0.9rem] px-2 py-2 text-sm font-medium text-text-muted disabled:pointer-events-none disabled:opacity-60"
								disabled={isAuthRouting}
								onClick={onAuthRoute}
								type="button"
							>
								{isAuthRouting ? t.signingOut : t.signOut}
							</button>
						) : (
							<button
								aria-busy={isAuthRouting}
								className="pressable inline-flex items-center rounded-[0.9rem] bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-60"
								disabled={isAuthRouting}
								onClick={onAuthRoute}
								type="button"
							>
								{isAuthRouting ? t.signingIn : t.signIn}
							</button>
						)}
					</div>
				</div>
			</section>

			<section className="space-y-3">
				<div>
					<p className="text-sm font-semibold text-foreground">
						{t.defaults}
					</p>
				</div>

				<div className="overflow-hidden rounded-[1rem] bg-surface">
					<div className="px-4 py-3">
						<ToggleSettingRow
							description={t.openToday}
							enabled={preferences.openReminderEnabled}
							label={t.reminder}
							onToggle={onReminderToggle}
						/>
					</div>
					<div className="mx-4 h-px bg-surface-soft" />
					<div className="px-4 py-3">
						<ToggleSettingRow
							description={t.showDoneInBoard}
							enabled={preferences.showDoneColumn}
							label={t.showDone}
							onToggle={onDoneColumnToggle}
						/>
					</div>
					<div className="mx-4 h-px bg-surface-soft" />
					<div className="px-4 py-3">
						<ChoiceSettingRow
							label={t.language}
							description={
								locale === "zh" ? t.chinese : t.english
							}
						>
							<ChoiceChip
								active={locale === "en"}
								disabled={isLocaleSaving}
								label={t.english}
								onClick={() => onLocaleChange("en")}
							/>
							<ChoiceChip
								active={locale === "zh"}
								disabled={isLocaleSaving}
								label={t.chinese}
								onClick={() => onLocaleChange("zh")}
							/>
						</ChoiceSettingRow>
					</div>
					<div className="mx-4 h-px bg-surface-soft" />
					<div className="px-4 py-3">
						<ChoiceSettingRow
							label={t.defaultBucket}
							description={formatBucketLabel(
								preferences.defaultTaskBucket,
								locale,
							)}
						>
							{(["backlog", "today", "tomorrow"] as const).map(
								(bucket) => (
									<ChoiceChip
										key={bucket}
										active={
											preferences.defaultTaskBucket ===
											bucket
										}
										label={formatBucketLabel(
											bucket,
											locale,
										)}
										onClick={() =>
											onDefaultBucketChange(bucket)
										}
									/>
								),
							)}
						</ChoiceSettingRow>
					</div>
					<div className="mx-4 h-px bg-surface-soft" />
					<div className="px-4 py-3">
						<ChoiceSettingRow
							label={t.weeklyDay}
							description={formatWeekdayLabel(
								preferences.weeklyRepeatWeekday,
								locale,
							)}
						>
							{WEEKLY_REPEAT_WEEKDAY_OPTIONS.map((weekday) => (
								<ChoiceChip
									key={weekday}
									active={
										preferences.weeklyRepeatWeekday ===
										weekday
									}
									disabled={isWeeklyRepeatDaySaving}
									label={formatWeekdayLabel(
										weekday,
										locale,
									)}
									onClick={() =>
										onWeeklyRepeatWeekdayChange(
											weekday,
										)
									}
								/>
							))}
						</ChoiceSettingRow>
					</div>
					<div className="mx-4 h-px bg-surface-soft" />
					<div className="px-4 py-3">
						<ChoiceSettingRow
							label={t.todayCap}
							description={`${preferences.preferredTodayLimit}`}
						>
							{TODAY_LIMIT_OPTIONS.map((limit) => (
								<ChoiceChip
									key={limit}
									active={
										preferences.preferredTodayLimit ===
										limit
									}
									label={`${limit}`}
									onClick={() => onTodayLimitChange(limit)}
								/>
							))}
						</ChoiceSettingRow>
					</div>
				</div>
			</section>

			<section className="space-y-3">
				<p className="text-sm font-semibold text-foreground">
					{t.rules}
				</p>
				<div className="overflow-hidden rounded-[1rem] bg-surface">
					<div className="px-4 py-4 text-sm text-text-muted">
						{t.tomorrowRule}
					</div>
					<div className="mx-4 h-px bg-surface-soft" />
					<div className="px-4 py-4 text-sm text-text-muted">
						{t.overdueRule}
					</div>
					<div className="mx-4 h-px bg-surface-soft" />
					<div className="px-4 py-4 text-sm text-text-muted">
						{t.editRule}
					</div>
				</div>
			</section>
		</div>
	);
}

function AppIssueState({
	issue,
	locale,
}: {
	issue: NonNullable<DashboardData["appIssue"]>;
	locale: AppLocale;
}) {
	const t = getDictionary(locale);
	const title =
		issue === "config-missing" ? t.appUnavailable : t.loadFailed;
	const hint =
		issue === "config-missing" ? t.appUnavailableHint : t.loadFailedHint;

	return (
		<div className="flex min-h-full items-center justify-center py-12">
			<div className="w-full max-w-sm text-center">
				<p className="text-lg font-semibold tracking-[-0.04em] text-foreground">
					{title}
				</p>
				<p className="mt-2 text-sm leading-6 text-text-muted">{hint}</p>
				<button
					className="pressable mt-5 inline-flex items-center rounded-[0.9rem] bg-accent px-4 py-2.5 text-sm font-semibold text-white"
					onClick={() => window.location.reload()}
					type="button"
				>
					{t.reload}
				</button>
			</div>
		</div>
	);
}

function ProjectChip({
	active,
	color,
	icon,
	label,
	onClick,
}: {
	active: boolean;
	color: string;
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"pressable inline-flex shrink-0 items-center gap-2 rounded-4xl px-3 py-2 text-sm font-semibold transition",
				active
					? "bg-surface text-foreground"
					: "bg-surface-soft text-text-muted",
			)}
			onClick={onClick}
			type="button"
		>
			<span
				className="flex h-6 w-6 items-center justify-center rounded-lg"
				style={{backgroundColor: `${color}1A`, color}}
			>
				{icon}
			</span>
			{label}
		</button>
	);
}

function SegmentButton({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"pressable flex min-h-10 w-full min-w-0 items-center justify-center rounded-[0.75rem] px-2.5 py-2 text-center text-[13px] font-medium transition",
				active
					? "bg-white text-accent-strong shadow-[0_2px_8px_rgba(17,24,28,0.04)]"
					: "text-foreground",
			)}
			onClick={onClick}
			type="button"
		>
			{label}
		</button>
	);
}

function ActionButton({
	accent,
	disabled,
	label,
	pending,
	pendingLabel,
	onClick,
}: {
	accent: "success" | "danger" | "neutral";
	disabled?: boolean;
	label: string;
	pending?: boolean;
	pendingLabel: string;
	onClick: () => void;
}) {
	return (
		<button
			aria-busy={pending}
			className={cn(
				"pressable px-3 py-3 text-center transition first:rounded-bl-[1rem] last:rounded-br-[1rem] disabled:pointer-events-none disabled:opacity-60",
				accent === "success" && !disabled && "text-accent-strong",
				accent === "danger" && !disabled && "text-danger",
				accent === "neutral" && !disabled && "text-foreground",
				disabled && "text-text-soft",
			)}
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			{pending ? pendingLabel : label}
		</button>
	);
}

function NavButton({
	active,
	icon,
	onClick,
}: {
	active: boolean;
	icon: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"pressable flex min-w-0 items-center justify-center px-1",
				active ? "text-accent-strong" : "text-foreground",
			)}
			onClick={onClick}
			type="button"
		>
			<span
				className={cn(
					"flex h-8 w-8 items-center justify-center rounded-[0.9rem] transition",
					active ? "bg-[#eaf6ef]" : "bg-transparent",
				)}
			>
				{icon}
			</span>
		</button>
	);
}

function CompactMetric({
	label,
	value,
}: {
	label: string;
	value: number | string;
}) {
	return (
		<div className="rounded-[0.95rem] bg-surface-muted px-4 py-3.5">
			<p className="text-[12px] font-medium text-text-muted">
				{label}
			</p>
			<p className="mt-1.5 text-lg font-semibold tracking-[-0.04em] text-foreground">
				{value}
			</p>
		</div>
	);
}

function ProjectStat({
	label,
	tone = "default",
	value,
}: {
	label: string;
	tone?: "default" | "danger" | "warning";
	value: number;
}) {
	return (
		<div className="rounded-[0.8rem] bg-surface px-2 py-2 text-center">
			<p className="text-[10px] text-text-soft">{label}</p>
			<p
				className={cn(
					"mt-1 text-sm font-semibold",
					tone === "danger"
						? "text-danger"
						: tone === "warning"
							? "text-[#b7832f]"
							: "text-foreground",
				)}
			>
				{value}
			</p>
		</div>
	);
}

function InlineEmptyState({
	hint,
}: {
	hint: string;
}) {
	return (
		<div className="flex min-h-44 items-center justify-center px-5 py-8 text-center">
			<p className="max-w-[14rem] text-[12px] leading-5 text-text-soft">
				{hint}
			</p>
		</div>
	);
}

function BucketTab({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"pressable px-0.5 pb-3 text-center text-[12px] font-semibold transition",
				active
					? "text-accent-strong"
					: "text-text-muted",
			)}
			onClick={onClick}
			type="button"
		>
			{label}
		</button>
	);
}

function ToggleSettingRow({
	description,
	enabled,
	label,
	onToggle,
}: {
	description: string;
	enabled: boolean;
	label: string;
	onToggle: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="min-w-0 pr-3">
				<p className="text-sm font-medium text-foreground">{label}</p>
				<p className="mt-0.5 text-[12px] leading-5 text-text-muted">
					{description}
				</p>
			</div>
			<button
				aria-pressed={enabled}
				className={cn(
					"pressable relative flex h-6 w-11 shrink-0 rounded-full p-0.5 transition",
					enabled ? "bg-accent" : "bg-[#d7ddd7]",
				)}
				onClick={onToggle}
				type="button"
			>
				<span
					className={cn(
						"h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(17,24,28,0.12)] transition",
						enabled ? "translate-x-5" : "translate-x-0",
					)}
				/>
			</button>
		</div>
	);
}

function ChoiceSettingRow({
	children,
	description,
	label,
}: {
	children: React.ReactNode;
	description: string;
	label: string;
}) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm font-medium text-foreground">{label}</p>
				<p className="shrink-0 text-[12px] text-text-muted">
					{description}
				</p>
			</div>
			<div className="grid grid-flow-col auto-cols-fr gap-1">
				{children}
			</div>
		</div>
	);
}

function ChoiceChip({
	active,
	disabled,
	label,
	onClick,
}: {
	active: boolean;
	disabled?: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"pressable flex min-h-8 w-full min-w-0 items-center justify-center rounded-[0.7rem] px-2 py-1.5 text-center text-[12px] font-medium transition disabled:pointer-events-none disabled:opacity-55",
				active
					? "bg-surface-muted text-foreground"
					: "bg-transparent text-text-muted",
			)}
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			{label}
		</button>
	);
}
