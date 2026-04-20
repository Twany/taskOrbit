"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { type AppLocale, formatWeekdayLabel, getDictionary } from "@/lib/locale";
import type { Project, RepeatType, Task, TaskPriority, WeeklyRepeatWeekday } from "@/lib/types";
import { cn } from "@/lib/utils";

type EditableBucket = "backlog" | "today" | "tomorrow" | "done";

type Props = {
  locale: AppLocale;
  projects: Project[];
  task: Task;
  initialBucket: EditableBucket;
  weeklyRepeatWeekday: WeeklyRepeatWeekday;
};

function formatBucketLabel(bucket: EditableBucket, locale: AppLocale) {
  const t = getDictionary(locale);

  switch (bucket) {
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

export function TaskEditForm({
  initialBucket,
  locale,
  projects,
  task,
  weeklyRepeatWeekday,
}: Props) {
  const t = getDictionary(locale);
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [projectId, setProjectId] = useState(task.projectId);
  const [bucket, setBucket] = useState<EditableBucket>(initialBucket);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [repeatType, setRepeatType] = useState<RepeatType>(task.repeatType ?? "none");
  const [actionDetail, setActionDetail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim() || !projectId) {
      return;
    }

    if (bucket === "done" && !actionDetail.trim()) {
      setMessage(t.taskDoneNeedsNote);
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: title.trim(),
        note,
        projectId,
        bucket,
        priority,
        repeatType,
        detail: bucket === "done" ? actionDetail.trim() : undefined,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(payload?.error ?? t.taskUpdateFailed);
      setIsSaving(false);
      return;
    }

    router.push(`/tasks/${task.id}`);
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-foreground">{t.name}</span>
        <input
          className="w-full rounded-[1rem] bg-surface-soft px-4 py-4 text-base text-foreground outline-none transition focus:bg-[#eef4ef]"
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t.taskPlaceholder}
          value={title}
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-foreground">{t.note}</span>
        <textarea
          className="min-h-24 w-full resize-none rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-foreground outline-none transition focus:bg-[#eef4ef]"
          onChange={(event) => setNote(event.target.value)}
          placeholder={t.notePlaceholder}
          value={note}
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground">{t.project}</span>
          <select
            className="w-full rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-foreground outline-none"
            onChange={(event) => setProjectId(event.target.value)}
            value={projectId}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground">{t.list}</span>
          <select
            className="w-full rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-foreground outline-none disabled:opacity-60"
            disabled={repeatType !== "none"}
            onChange={(event) => setBucket(event.target.value as EditableBucket)}
            value={bucket}
          >
            {(["backlog", "today", "tomorrow", "done"] as const).map((value) => (
              <option key={value} value={value}>
                {formatBucketLabel(value, locale)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-foreground">{t.repeat}</span>
        <div className="grid grid-cols-3 rounded-[0.9rem] bg-surface-soft p-0.5">
          {([
            ["none", t.none],
            ["daily", t.daily],
            ["weekly", `${t.weekly} · ${formatWeekdayLabel(weeklyRepeatWeekday, locale)}`],
          ] as const).map(([value, label]) => (
            <SegmentButton
              key={value}
              active={repeatType === value}
              label={label}
              onClick={() => {
                setRepeatType(value);
                if (value !== "none") {
                  setBucket("today");
                }
              }}
            />
          ))}
        </div>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-foreground">{t.priority}</span>
        <div className="grid grid-cols-3 rounded-[0.9rem] bg-surface-soft p-0.5">
          {([
            ["low", t.low],
            ["medium", t.med],
            ["high", t.high],
          ] as const).map(([value, label]) => (
            <SegmentButton
              key={value}
              active={priority === value}
              label={label}
              onClick={() => setPriority(value)}
            />
          ))}
        </div>
      </label>

      {bucket === "done" ? (
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground">{t.doneNote}</span>
          <textarea
            className="min-h-24 w-full resize-none rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-foreground outline-none transition focus:bg-[#eef4ef]"
            onChange={(event) => setActionDetail(event.target.value)}
            placeholder={t.doneNotePlaceholder}
            value={actionDetail}
          />
        </label>
      ) : null}

      {message ? (
        <p className="text-sm text-danger">{message}</p>
      ) : null}

      <button
        aria-busy={isSaving}
        className="pressable mt-2 flex w-full items-center justify-center rounded-[1rem] bg-accent px-4 py-4 text-base font-semibold text-white disabled:pointer-events-none disabled:opacity-60"
        disabled={isSaving}
        onClick={handleSave}
        type="button"
      >
        {isSaving ? t.saving : t.save}
      </button>
    </div>
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
        active ? "bg-white text-accent-strong shadow-[0_2px_8px_rgba(17,24,28,0.04)]" : "text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
