"use client";

import {
	startTransition,
	useDeferredValue,
	useEffect,
	useEffectEvent,
	useMemo,
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
	Plus,
	Settings,
	Sparkles,
	UserRound,
} from "lucide-react";

import {
	countTodayOpenTasks,
	getProjectStats,
	getTaskBucket,
	getWeekBuckets,
	groupTasks,
} from "@/lib/task-groups";
import {
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
	Task,
	TaskBucket,
	TaskPriority,
} from "@/lib/types";
import {cn} from "@/lib/utils";

type ComposerState = {
	title: string;
	projectId: string;
	bucket: Extract<TaskBucket, "backlog" | "today" | "tomorrow">;
	priority: TaskPriority;
};

type TaskMutationPayload = {
	bucket: Extract<TaskBucket, "backlog" | "today" | "tomorrow" | "done">;
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

type AppPreferences = {
	openReminderEnabled: boolean;
	defaultTaskBucket: ComposerState["bucket"];
	preferredTodayLimit: (typeof TODAY_LIMIT_OPTIONS)[number];
	showDoneColumn: boolean;
};

const DEFAULT_PREFERENCES: AppPreferences = {
	openReminderEnabled: true,
	defaultTaskBucket: "backlog",
	preferredTodayLimit: 5,
	showDoneColumn: true,
};

function readStoredPreferences() {
	if (typeof window === "undefined") {
		return DEFAULT_PREFERENCES;
	}

	const savedPreferences = window.localStorage.getItem(APP_PREFERENCES_KEY);

	if (!savedPreferences) {
		return DEFAULT_PREFERENCES;
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
		} satisfies AppPreferences;
	} catch {
		window.localStorage.removeItem(APP_PREFERENCES_KEY);
		return DEFAULT_PREFERENCES;
	}
}

type ProjectEditorState = {
	id: string | null;
	name: string;
	color: string;
	icon: Project["icon"];
	status: Project["status"];
};

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

function buildTaskPatch(bucket: TaskMutationPayload["bucket"]) {
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
		readStoredPreferences,
	);
	const [activeScreen, setActiveScreen] = useState<AppScreen>("tasks");
	const [activeProjectId, setActiveProjectId] = useState(PROJECT_ALL_ID);
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
	const [composerOpen, setComposerOpen] = useState(false);
	const [projectSheetOpen, setProjectSheetOpen] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [showReminder, setShowReminder] = useState(
		readStoredPreferences().openReminderEnabled,
	);
	const [composer, setComposer] = useState<ComposerState>({
		title: "",
		projectId: initialData.projects[0]?.id ?? "",
		bucket: "backlog",
		priority: "medium",
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

	const canSyncToCloud =
		initialData.source === "supabase" && initialData.viewer.isAuthenticated;

	async function handleLocaleChange(nextLocale: AppLocale) {
		setLocale(nextLocale);
		void fetch("/api/locale", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ locale: nextLocale }),
		});
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
		setComposer({
			title: "",
			projectId: getPreferredProjectId(composer.projectId),
			bucket,
			priority: "medium",
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
			throw new Error("Unable to update task");
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
			throw new Error("Unable to create task");
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
			throw new Error("Unable to create project");
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
			throw new Error("Unable to update project");
		}

		const data = (await response.json()) as {project: Project};
		return data.project;
	}

	async function persistProjectDelete(projectId: string) {
		const response = await fetch(`/api/projects/${projectId}`, {
			method: "DELETE",
		});

		if (!response.ok) {
			throw new Error("Unable to delete project");
		}
	}

	function handleTaskMove(
		taskId: string,
		bucket: TaskMutationPayload["bucket"],
	) {
		const previousTasks = tasks;
		const patch = buildTaskPatch(bucket);

		setStatusMessage(null);
		startTransition(async () => {
			setTasks((current) =>
				current.map((task) =>
					task.id === taskId ? {...task, ...patch} : task,
				),
			);

			if (!canSyncToCloud) {
				return;
			}

			try {
				const syncedTask = await persistTaskUpdate(taskId, {bucket});
				setTasks((current) =>
					current.map((task) =>
						task.id === taskId ? syncedTask : task,
					),
				);
			} catch {
				setTasks(previousTasks);
				setStatusMessage(
					t.cloudSyncFailed,
				);
			}
		});
	}

	function handleTaskCreate() {
		if (!composer.title.trim() || !composer.projectId) {
			return;
		}

		const optimisticTask: Task = {
			id: `local-${crypto.randomUUID()}`,
			projectId: composer.projectId,
			title: composer.title.trim(),
			note: "",
			priority: composer.priority,
			createdAt: new Date().toISOString(),
			...buildTaskPatch(composer.bucket),
		};

		setStatusMessage(null);
		setComposerOpen(false);

		startTransition(async () => {
			setTasks((current) => [optimisticTask, ...current]);
			setComposer({
				title: "",
				projectId: getPreferredProjectId(composer.projectId),
				bucket: preferences.defaultTaskBucket,
				priority: "medium",
			});

			if (!canSyncToCloud) {
				return;
			}

			try {
				const syncedTask = await persistTaskCreate(composer);
				setTasks((current) =>
					current.map((task) =>
						task.id === optimisticTask.id ? syncedTask : task,
					),
				);
			} catch {
				setTasks((current) =>
					current.filter((task) => task.id !== optimisticTask.id),
				);
				setStatusMessage(
					t.taskCreateFailed,
				);
			}
		});
	}

	function openCreateProject() {
		setProjectEditor(createProjectEditor());
		setProjectSheetOpen(true);
	}

	function openEditProject(project: Project) {
		setProjectEditor(createProjectEditor(project));
		setProjectSheetOpen(true);
	}

	function handleProjectSave() {
		const name = projectEditor.name.trim();

		if (!name) {
			setStatusMessage(t.projectNameEmpty);
			return;
		}

		const previousProjects = projects;
		setStatusMessage(null);
		setProjectSheetOpen(false);

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

			startTransition(async () => {
				setProjects((current) =>
					current.map((project) =>
						project.id === optimisticProject.id
							? optimisticProject
							: project,
					),
				);

				if (!canSyncToCloud) {
					return;
				}

				try {
					const syncedProject = await persistProjectUpdate(
						projectId,
						{
							...projectEditor,
							name,
						},
					);
					setProjects((current) =>
						current.map((project) =>
							project.id === syncedProject.id
								? syncedProject
								: project,
						),
					);
				} catch {
					setProjects(previousProjects);
					setStatusMessage(
						t.projectUpdateFailed,
					);
				}
			});

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

		startTransition(async () => {
			setProjects((current) => [...current, optimisticProject]);
			setActiveProjectId(optimisticProject.id);

			if (!canSyncToCloud) {
				return;
			}

			try {
				const syncedProject = await persistProjectCreate({
					...projectEditor,
					name,
				});
				setProjects((current) =>
					current.map((project) =>
						project.id === optimisticProject.id
							? syncedProject
							: project,
					),
				);
				setActiveProjectId(syncedProject.id);
			} catch {
				setProjects(previousProjects);
				setActiveProjectId(PROJECT_ALL_ID);
				setStatusMessage(
					t.projectCreateFailed,
				);
			}
		});
	}

	function handleProjectDelete() {
		if (!projectEditor.id) {
			return;
		}

		const deletingProjectId = projectEditor.id;

		if (projects.length <= 1) {
			setStatusMessage(t.projectKeepOne);
			return;
		}

		const previousProjects = projects;
		const previousTasks = tasks;
		setStatusMessage(null);
		setProjectSheetOpen(false);

		startTransition(async () => {
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

			if (!canSyncToCloud) {
				return;
			}

			try {
				await persistProjectDelete(deletingProjectId);
			} catch {
				setProjects(previousProjects);
				setTasks(previousTasks);
				setStatusMessage(
					t.projectDeleteFailed,
				);
			}
		});
	}

	return (
		<main className="flex min-h-screen items-start justify-center px-0 py-0 sm:px-6 sm:py-10">
			<div className="device-shadow flex min-h-screen w-full max-w-[430px] flex-col overflow-hidden bg-background sm:min-h-[880px] sm:rounded-[2.15rem]">
				{isHomeScreen ? (
					<header className="safe-pt bg-background px-5 pb-3">
						<div className="mb-2 flex items-center justify-between text-foreground">
							<span className="font-mono text-base font-medium tracking-tight">
								{format(new Date(), "HH:mm")}
							</span>
							<div className="flex items-center gap-2">
								<span
									className={cn(
										"h-2 w-2 rounded-full",
										initialData.source === "supabase" &&
											initialData.viewer.isAuthenticated
											? "bg-accent"
											: "bg-text-soft",
									)}
								/>
								<span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
									{initialData.source === "supabase" &&
									initialData.viewer.isAuthenticated
										? t.cloud
										: t.demo}
								</span>
							</div>
						</div>

						<div className="flex items-center justify-between gap-3">
							<p className="text-base font-semibold text-foreground">
								{selectedProject?.name ?? t.all}
							</p>
							<div className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] bg-surface-muted text-text-muted">
								<UserRound className="h-4 w-4" />
							</div>
						</div>

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
								className="mt-3 flex w-full items-center justify-between rounded-2xl bg-[#edf8f1] px-4 py-3 text-left"
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
						"flex-1 overflow-y-auto bg-background px-5 pb-32",
						isHomeScreen ? "pt-5" : "safe-pt pt-4",
					)}
				>
					{statusMessage ? (
						<div className="mb-4 rounded-2xl bg-[#fff5f5] px-4 py-3 text-sm text-[#b95c59]">
							{statusMessage}
						</div>
					) : null}

					{activeScreen === "tasks" ? (
						<TasksScreen
							groupedAllTasks={groupedAllTasks}
							groupedTasks={groupedTasks}
							locale={locale}
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

					{activeScreen === "projects" ? (
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

					{activeScreen === "review" ? (
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
							preferences={preferences}
							viewer={initialData.viewer}
							source={initialData.source}
						/>
					) : null}
				</section>

				<nav className="safe-pb fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[430px] items-end justify-between bg-[rgba(255,255,255,0.94)] px-5 pb-3 pt-2 backdrop-blur-md sm:rounded-b-[2.15rem]">
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
						className="card-shadow -mt-7 flex h-[3.35rem] w-[3.35rem] items-center justify-center rounded-[1.15rem] bg-accent text-white"
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
					<div className="fixed inset-0 z-20 flex items-end justify-center bg-[rgba(28,40,54,0.28)] px-4 pb-0 pt-10">
						<div className="w-full max-w-[430px] rounded-t-[2rem] bg-surface px-5 pb-8 pt-5">
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
									className="rounded-xl bg-surface-soft px-3 py-2 text-sm font-semibold text-text-muted"
									onClick={() => setComposerOpen(false)}
									type="button"
								>
									{t.close}
								</button>
							</div>

							<div className="mt-5 space-y-4">
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
										placeholder={
											t.taskPlaceholder
										}
										value={composer.title}
									/>
								</label>

								<div className="grid grid-cols-2 gap-4">
									<label className="block">
										<span className="mb-2 block text-sm font-semibold text-foreground">
											{t.project}
										</span>
										<select
											className="w-full rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-foreground outline-none"
											onChange={(event) =>
												setComposer((current) => ({
													...current,
													projectId:
														event.target.value,
												}))
											}
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
										</select>
									</label>

									<label className="block">
										<span className="mb-2 block text-sm font-semibold text-foreground">
											{t.list}
										</span>
										<select
											className="w-full rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-foreground outline-none"
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
											<option value="today">{t.today}</option>
											<option value="tomorrow">
												{t.tomorrow}
											</option>
										</select>
									</label>
								</div>

								<label className="block">
									<span className="mb-2 block text-sm font-semibold text-foreground">
										{t.priority}
									</span>
									<div className="rounded-[1rem] bg-surface-soft p-1">
										{priorityOptions.map(([priority, label]) => (
											<SegmentButton
												key={priority}
												active={
													composer.priority ===
													priority
												}
												label={label}
												onClick={() =>
													setComposer((current) => ({
														...current,
														priority,
													}))
												}
											/>
										))}
									</div>
								</label>
							</div>

							<button
								className="mt-6 flex w-full items-center justify-center rounded-[1rem] bg-accent px-4 py-4 text-base font-semibold text-white"
								onClick={handleTaskCreate}
								type="button"
							>
								{t.save}
							</button>
						</div>
					</div>
				) : null}

				{projectSheetOpen ? (
					<div className="fixed inset-0 z-20 flex items-end justify-center bg-[rgba(28,40,54,0.28)] px-4 pb-0 pt-10">
						<div className="w-full max-w-[430px] rounded-t-[2rem] bg-surface px-5 pb-8 pt-5">
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
									className="rounded-xl bg-surface-soft px-3 py-2 text-sm font-semibold text-text-muted"
									onClick={() => setProjectSheetOpen(false)}
									type="button"
								>
									{t.close}
								</button>
							</div>

							<div className="mt-5 space-y-4">
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
													"h-10 w-10 rounded-[0.9rem] transition",
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
													"flex h-12 items-center justify-center rounded-[0.95rem] bg-surface-soft transition",
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
									<div className="rounded-[1rem] bg-surface-soft p-1">
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
							</div>

							<button
								className="mt-6 flex w-full items-center justify-center rounded-[1rem] bg-accent px-4 py-4 text-base font-semibold text-white"
								onClick={handleProjectSave}
								type="button"
							>
								{t.save}
							</button>

							{projectEditor.id ? (
								<button
									className="mt-3 flex w-full items-center justify-center rounded-[1rem] bg-[#fff3f3] px-4 py-4 text-sm font-semibold text-danger"
									onClick={handleProjectDelete}
									type="button"
								>
									{t.delete}
								</button>
							) : null}
						</div>
					</div>
				) : null}
			</div>
		</main>
	);
}

function TasksScreen({
	groupedAllTasks,
	groupedTasks,
	locale,
	onQuickAdd,
	onMoveTask,
	preferredTodayLimit,
	selectedTaskId,
	setSelectedTaskId,
	showDoneColumn,
}: {
	groupedAllTasks: ReturnType<typeof groupTasks>;
	groupedTasks: ReturnType<typeof groupTasks>;
	locale: AppLocale;
	onQuickAdd: (bucket: TaskBucket) => void;
	onMoveTask: (taskId: string, bucket: TaskMutationPayload["bucket"]) => void;
	preferredTodayLimit: number;
	selectedTaskId: string | null;
	setSelectedTaskId: (taskId: string | null) => void;
	showDoneColumn: boolean;
}) {
	const t = getDictionary(locale);
	const sections: TaskBucket[] = showDoneColumn
		? ["overdue", "today", "tomorrow", "backlog", "done"]
		: ["overdue", "today", "tomorrow", "backlog"];
	const todayCount = groupedTasks.today.length;
	const overdueCount = groupedTasks.overdue.length;
	const boardOpenCount =
		groupedTasks.overdue.length +
		groupedTasks.today.length +
		groupedTasks.tomorrow.length +
		groupedTasks.backlog.length;
	const allProjectsTodayCount = groupedAllTasks.today.length;
	const slotsRemaining = Math.max(preferredTodayLimit - todayCount, 0);
	const todayMessage =
		overdueCount > 0
			? t.todayMessageOverdue(overdueCount)
			: todayCount === 0
				? t.empty
				: todayCount > preferredTodayLimit
					? t.todayMessageOver(todayCount - preferredTodayLimit)
					: t.todayMessageLeft(slotsRemaining);

	return (
		<div className="-mx-5 space-y-4">
			<div className="px-5">
				<div className="flex items-end justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
							{t.board}
						</p>
						<h2 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">
							{t.today} {todayCount}/{preferredTodayLimit}
						</h2>
						<p className="mt-1 text-sm text-text-muted">
							{todayMessage}
						</p>
					</div>
					<div className="text-right">
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">
							{t.all}
						</p>
						<p className="mt-1 text-sm font-semibold text-foreground">
							{allProjectsTodayCount} {t.due}
						</p>
						<p className="text-xs text-text-muted">
							{boardOpenCount} {t.open}
						</p>
					</div>
				</div>
			</div>

			<div className="overflow-x-auto px-5 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
				<div className="flex snap-x snap-mandatory gap-4 pr-5">
					{sections.map((bucket) => (
						<section
							key={bucket}
							className={cn(
								"flex h-[30rem] w-[84%] shrink-0 snap-start flex-col rounded-[1.2rem] p-3.5",
								bucket === "done"
									? "bg-[#ebeee7]"
									: "bg-[#e7ebe3]",
							)}
						>
							<div className="px-0.5 pb-1">
								<h2 className="text-sm font-semibold text-foreground">
									{formatBucketLabel(bucket, locale)}
								</h2>
							</div>

							<div className="mt-2 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
								<div className="space-y-2.5 pb-3">
									{groupedTasks[bucket].length === 0 ? (
										<div className="px-1 py-6 text-sm text-text-muted">
											{t.empty}
										</div>
									) : null}

									{groupedTasks[bucket].map((task) => {
										const expanded =
											selectedTaskId === task.id;

										return (
											<article
												key={task.id}
												className={cn(
													"rounded-[1rem] bg-white transition",
													bucket === "overdue" &&
														!expanded &&
														"bg-[#fff7f5]",
													bucket === "done" &&
														!expanded &&
														"bg-[#fbfcfa]",
												)}
											>
												<button
													className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
													onClick={() =>
														setSelectedTaskId(
															expanded
																? null
																: task.id,
														)
													}
													type="button"
												>
													<span className="min-w-0 flex-1">
														<span className="flex items-start justify-between gap-3">
															<span>
																<span className="block text-[12px] font-semibold leading-5 text-foreground">
																	{task.title}
																</span>
																<span className="mt-1 block text-[10px] text-text-muted">
																	{formatTaskMeta(task, locale)}
																</span>
															</span>
															<Link
																aria-label={t.openDetails(task.title)}
																className="rounded-md p-0.5 text-text-soft"
																href={`/tasks/${task.id}`}
																onClick={(
																	event,
																) =>
																	event.stopPropagation()
																}
															>
																<ChevronRight className="h-3.5 w-3.5" />
															</Link>
														</span>
													</span>
												</button>

												{expanded ? (
													<div className="rounded-b-[1rem] grid grid-cols-3 bg-[#eef1ea] text-[11px] font-semibold">
														<ActionButton
															accent="success"
															disabled={
																bucket ===
																"today"
															}
															label={t.today}
															onClick={() =>
																onMoveTask(
																	task.id,
																	"today",
																)
															}
														/>
														<ActionButton
															accent="neutral"
															disabled={
																bucket ===
																"tomorrow"
															}
															label={t.tomorrow}
															onClick={() =>
																onMoveTask(
																	task.id,
																	"tomorrow",
																)
															}
														/>
														<ActionButton
															accent={
																bucket ===
																"done"
																	? "neutral"
																	: "danger"
															}
															label={
																bucket ===
																"done"
																	? t.backlog
																	: t.done
															}
															onClick={() =>
																onMoveTask(
																	task.id,
																	bucket ===
																		"done"
																		? "backlog"
																		: "done",
																)
															}
														/>
													</div>
												) : null}
											</article>
										);
									})}
								</div>
							</div>

							<button
								className="mt-2 flex items-center gap-2 px-1.5 py-2 text-xs font-semibold text-text-muted transition hover:text-accent-strong"
								onClick={() => onQuickAdd(bucket)}
								type="button"
							>
								<Plus className="h-4 w-4" />
									{t.add}
							</button>
						</section>
					))}
				</div>
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
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm font-semibold text-accent-strong">
						{t.projects}
					</p>
				</div>
				<button
					className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
					onClick={onCreateProject}
					type="button"
				>
					<Plus className="h-4 w-4" />
					{t.new}
				</button>
			</div>

			<section className="grid grid-cols-2 gap-3">
				<CompactMetric label={t.active} value={activeProjects} />
				<CompactMetric label={t.today} value={totalToday} />
				<CompactMetric label={t.overdue} value={totalOverdue} />
				<CompactMetric label={t.backlog} value={totalBacklog} />
			</section>

			<div className="flex items-center justify-between text-xs text-text-muted">
				<p>{t.paused(pausedProjects)}</p>
				<p>{t.limitCount(preferredTodayLimit)}</p>
			</div>

			<div className="space-y-2">
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
						<button
							key={project.id}
							className="w-full rounded-[1.05rem] bg-surface-muted px-4 py-4 text-left transition hover:bg-surface-soft"
							onClick={() => onEditProject(project)}
							type="button"
						>
							<div className="flex items-start justify-between gap-4">
								<div className="flex items-center gap-3">
									<span
										className="flex h-10 w-10 items-center justify-center rounded-[0.9rem]"
										style={{
											backgroundColor: `${project.color}1A`,
											color: project.color,
										}}
									>
										{projectIcon(project.icon, "h-4 w-4")}
									</span>
									<div>
										<h2 className="text-sm font-semibold text-foreground">
											{project.name}
										</h2>
										<p className="mt-1 text-xs text-text-muted">
											{statusCopy}
										</p>
									</div>
								</div>
									<div className="text-right">
										<p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
											{project.status === "active"
												? t.active
												: t.pausedLabel}
										</p>
									<p className="mt-1 text-sm font-semibold text-foreground">
										{t.projectOpen(openCount)}
									</p>
								</div>
							</div>

							<div className="mt-4 grid grid-cols-4 gap-2">
								<ProjectStatInline
									label={t.today}
									value={stats.today}
								/>
								<ProjectStatInline
									label={t.overdue}
									tone={needsAttention ? "danger" : "default"}
									value={stats.overdue}
								/>
								<ProjectStatInline
									label={t.backlog}
									value={backlog}
								/>
								<ProjectStatInline
									label={t.done}
									value={stats.done}
								/>
							</div>

							<div className="mt-4 flex items-center justify-between text-xs text-text-muted">
									<p>{t.doneRate(stats.completionRate)}</p>
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
						</button>
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
					<p className="text-sm font-semibold text-accent-strong">
						{t.review}
					</p>
					<h2 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">
						{t.review}
					</h2>
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

			<section className="rounded-[1.1rem] bg-surface-muted px-4 py-4">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
							{t.week}
						</p>
						<p className="mt-1 text-sm text-text-muted">
							{t.planDone(plannedThisWeek, doneThisWeek)}
						</p>
					</div>
					<p className="text-sm font-semibold text-foreground">
						{totalTomorrow} {t.next}
					</p>
				</div>

				<div className="mt-4 grid grid-cols-7 gap-2">
					{weekBuckets.map((bucket) => (
						<div
							key={bucket.date}
							className={cn(
								"rounded-[0.9rem] px-2 py-3",
								bucket.isToday ? "bg-white" : "bg-[#f5f7f2]",
							)}
						>
							<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">
								{formatLocaleWeekday(bucket.date, locale)}
							</p>
							<p className="mt-2 text-base font-semibold text-foreground">
								{bucket.dayNumber}
							</p>
							<p className="mt-2 text-[11px] text-text-muted">
								{bucket.plannedCount} {t.due}
							</p>
							<p className="text-[11px] text-accent-strong">
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
					<div className="rounded-[1rem] bg-surface-muted px-4 py-4 text-sm text-text-muted">
						{t.clear}
					</div>
				) : (
					<div className="space-y-2">
						{attentionProjects.map(({backlog, project, stats}) => (
							<div
								key={project.id}
								className="rounded-[1rem] bg-surface-muted px-4 py-4"
							>
								<div className="flex items-center justify-between gap-4">
									<div className="flex items-center gap-3">
										<span
											className="flex h-9 w-9 items-center justify-center rounded-[0.9rem]"
											style={{
												backgroundColor: `${project.color}1A`,
												color: project.color,
											}}
										>
											{projectIcon(
												project.icon,
												"h-4 w-4",
											)}
										</span>
										<div>
											<p className="text-sm font-semibold text-foreground">
												{project.name}
											</p>
											<p className="mt-1 text-xs text-text-muted">
												{stats.overdue > 0
														? t.attentionOverdue(stats.overdue)
														: stats.today >
														  preferredTodayLimit
														? t.attentionToday(stats.today)
														: t.attentionBacklog(backlog)}
											</p>
										</div>
									</div>
									<div className="text-right text-xs text-text-muted">
										<p>{stats.today} {t.today}</p>
										<p>{backlog} {t.backlog}</p>
									</div>
								</div>
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
	locale,
	onDefaultBucketChange,
	onDoneColumnToggle,
	onLocaleChange,
	onReminderToggle,
	onTodayLimitChange,
	preferences,
	viewer,
	source,
}: {
	locale: AppLocale;
	onDefaultBucketChange: (bucket: ComposerState["bucket"]) => void;
	onDoneColumnToggle: () => void;
	onLocaleChange: (locale: AppLocale) => void;
	onReminderToggle: () => void;
	onTodayLimitChange: (limit: (typeof TODAY_LIMIT_OPTIONS)[number]) => void;
	preferences: AppPreferences;
	viewer: DashboardData["viewer"];
	source: DashboardData["source"];
}) {
	const t = getDictionary(locale);
	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div>
					<p className="text-sm font-semibold text-accent-strong">
						{t.account}
					</p>
					<h2 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">
						{viewer.isAuthenticated ? viewer.label : t.sync}
					</h2>
					<p className="mt-1 text-sm leading-6 text-text-muted">
						{viewer.isAuthenticated
							? viewer.email
							: t.settingsSyncHint}
					</p>
				</div>
				<div className="flex items-center justify-between rounded-[1rem] bg-surface-muted px-4 py-4">
					<div>
						<p className="text-sm font-semibold text-foreground">
							{t.sync}
						</p>
						<p className="mt-1 text-xs text-text-muted">
							{source === "supabase" ? t.cloud : t.demo}
						</p>
					</div>
					<Link
						className="inline-flex items-center rounded-[0.9rem] bg-accent px-4 py-2.5 text-sm font-semibold text-white"
						href="/login"
					>
						{viewer.isAuthenticated ? t.manage : t.signIn}
					</Link>
				</div>
			</section>

			<section className="space-y-3">
				<div>
					<p className="text-sm font-semibold text-foreground">
						{t.defaults}
					</p>
				</div>

				<div className="space-y-3 rounded-[1rem] bg-surface-muted px-4 py-4">
					<ToggleSettingRow
						description={t.openToday}
						enabled={preferences.openReminderEnabled}
						label={t.reminder}
						onToggle={onReminderToggle}
					/>
					<ToggleSettingRow
						description={t.showDoneInBoard}
						enabled={preferences.showDoneColumn}
						label={t.showDone}
						onToggle={onDoneColumnToggle}
					/>
				</div>

				<div className="rounded-[1rem] bg-surface-muted px-4 py-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-sm font-semibold text-foreground">
								{t.language}
							</p>
						</div>
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
							{locale === "zh" ? t.chinese : t.english}
						</p>
					</div>
					<div className="mt-4 flex gap-2">
						<ChoiceChip
							active={locale === "en"}
							label={t.english}
							onClick={() => onLocaleChange("en")}
						/>
						<ChoiceChip
							active={locale === "zh"}
							label={t.chinese}
							onClick={() => onLocaleChange("zh")}
						/>
					</div>
				</div>

				<div className="rounded-[1rem] bg-surface-muted px-4 py-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-sm font-semibold text-foreground">
								{t.defaultBucket}
							</p>
							<p className="mt-1 text-xs text-text-muted">
								{t.newTaskList}
							</p>
						</div>
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
							{formatBucketLabel(preferences.defaultTaskBucket, locale)}
						</p>
					</div>
					<div className="mt-4 flex gap-2">
						{(["backlog", "today", "tomorrow"] as const).map(
							(bucket) => (
								<ChoiceChip
									key={bucket}
									active={
										preferences.defaultTaskBucket === bucket
									}
									label={formatBucketLabel(bucket, locale)}
									onClick={() =>
										onDefaultBucketChange(bucket)
									}
								/>
							),
						)}
					</div>
				</div>

				<div className="rounded-[1rem] bg-surface-muted px-4 py-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-sm font-semibold text-foreground">
								{t.todayCap}
							</p>
							<p className="mt-1 text-xs text-text-muted">
								{t.todayCapHint}
							</p>
						</div>
						<p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
							{preferences.preferredTodayLimit}
						</p>
					</div>
					<div className="mt-4 flex gap-2">
						{TODAY_LIMIT_OPTIONS.map((limit) => (
							<ChoiceChip
								key={limit}
								active={
									preferences.preferredTodayLimit === limit
								}
								label={`${limit}`}
								onClick={() => onTodayLimitChange(limit)}
							/>
						))}
					</div>
				</div>
			</section>

			<section className="rounded-[1rem] bg-surface-muted px-4 py-4">
				<p className="text-sm font-semibold text-foreground">{t.rules}</p>
				<div className="mt-4 space-y-3 text-sm text-text-muted">
					<p>{t.tomorrowRule}</p>
					<p>{t.overdueRule}</p>
					<p>{t.editRule}</p>
				</div>
			</section>
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
				"inline-flex shrink-0 items-center gap-2 rounded-4xl px-3 py-2 text-sm font-semibold transition",
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
				"rounded-[0.9rem] px-4 py-3 text-sm font-semibold transition",
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
	onClick,
}: {
	accent: "success" | "danger" | "neutral";
	disabled?: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"px-3 py-3 text-center transition first:rounded-bl-[1rem] last:rounded-br-[1rem]",
				accent === "success" && !disabled && "text-accent-strong",
				accent === "danger" && !disabled && "text-danger",
				accent === "neutral" && !disabled && "text-foreground",
				disabled && "text-text-soft",
			)}
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			{label}
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
				"flex min-w-0 items-center justify-center px-1",
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
		<div className="rounded-[1rem] bg-surface-muted px-4 py-4">
			<p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">
				{label}
			</p>
			<p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-foreground">
				{value}
			</p>
		</div>
	);
}

function ProjectStatInline({
	label,
	tone = "default",
	value,
}: {
	label: string;
	tone?: "default" | "danger";
	value: number;
}) {
	return (
		<div className="space-y-1">
			<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">
				{label}
			</p>
			<p
				className={cn(
					"text-sm font-semibold",
					tone === "danger" ? "text-danger" : "text-foreground",
				)}
			>
				{value}
			</p>
		</div>
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
		<div className="flex items-start justify-between gap-4">
			<div>
				<p className="text-sm font-semibold text-foreground">{label}</p>
				<p className="mt-1 text-xs leading-5 text-text-muted">
					{description}
				</p>
			</div>
			<button
				aria-pressed={enabled}
				className={cn(
					"relative mt-1 flex h-7 w-12 shrink-0 rounded-full p-1 transition",
					enabled ? "bg-accent" : "bg-[#d9dfd8]",
				)}
				onClick={onToggle}
				type="button"
			>
				<span
					className={cn(
						"h-5 w-5 rounded-full bg-white shadow-[0_2px_6px_rgba(17,24,28,0.12)] transition",
						enabled ? "translate-x-5" : "translate-x-0",
					)}
				/>
			</button>
		</div>
	);
}

function ChoiceChip({
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
				"rounded-[0.9rem] px-3 py-2 text-sm font-semibold transition",
				active
					? "bg-white text-foreground shadow-[0_2px_8px_rgba(17,24,28,0.05)]"
					: "bg-transparent text-text-muted",
			)}
			onClick={onClick}
			type="button"
		>
			{label}
		</button>
	);
}
