import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  CircleCheckBig,
  Pencil,
  FolderKanban,
  ListTodo,
  TriangleAlert,
} from "lucide-react";

import { formatLocaleDate, formatLocaleDateTime, getDictionary } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale.server";
import { getTaskById } from "@/lib/repository";
import { getTaskBucket } from "@/lib/task-groups";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const locale = await getRequestLocale();
  const t = getDictionary(locale);
  const result = await getTaskById(taskId);

  if (!result) {
    notFound();
  }

  const { task, project, evidence } = result;
  const bucket = getTaskBucket(task);

  return (
    <main className="flex min-h-screen items-start justify-center px-0 py-0 sm:px-6 sm:py-10">
      <div className="device-shadow flex min-h-screen w-full max-w-[430px] flex-col bg-background sm:min-h-[860px] sm:rounded-[2.15rem]">
        <header className="safe-pt flex items-center justify-between px-5 pb-4 pt-6">
          <Link className="pressable rounded-[0.85rem] px-2 py-2 text-foreground" href="/">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <p className="text-sm font-semibold text-foreground">{t.task}</p>
          <Link
            className="pressable flex h-9 w-9 items-center justify-center rounded-[0.85rem] text-foreground"
            href={`/tasks/${task.id}/edit`}
          >
            <Pencil className="h-4.5 w-4.5" />
          </Link>
        </header>

        <section className="flex-1 px-5 pb-10 pt-2">
          <h1 className="text-[1.7rem] font-semibold tracking-[-0.05em] text-foreground">
            {task.title}
          </h1>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-text-muted">
            {task.note ?? t.noNote}
          </p>

          <div className="mt-8 overflow-hidden rounded-[1rem] bg-surface">
            <DetailRow
              icon={<FolderKanban className="h-4 w-4" />}
              label={t.project}
              value={project?.name ?? t.unknown}
            />
            <DetailRow
              icon={<ListTodo className="h-4 w-4" />}
              label={t.detailBucket}
              value={
                bucket === "overdue"
                  ? t.overdue
                  : bucket === "today"
                    ? t.today
                    : bucket === "tomorrow"
                      ? t.tomorrow
                      : bucket === "done"
                        ? t.done
                        : t.backlog
              }
            />
            <DetailRow
              icon={<CalendarDays className="h-4 w-4" />}
              label={t.detailDate}
              value={task.plannedDate ? formatLocaleDate(task.plannedDate, locale) : t.noDate}
            />
            <DetailRow
              icon={bucket === "done" ? <CircleCheckBig className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
              label={t.detailState}
              value={task.completedAt ? t.stateDone : t.stateOpen}
            />
            <DetailRow
              icon={<CalendarDays className="h-4 w-4" />}
              label={t.detailRepeat}
              last
              value={
                task.repeatType === "daily"
                  ? t.daily
                  : task.repeatType === "weekly"
                    ? t.weekly
                    : t.none
              }
            />
          </div>

          <div className="mt-7 px-1">
            <p className="text-sm font-medium text-foreground">{t.rule}</p>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              {t.ruleHint}
            </p>
          </div>

          <div className="mt-7 overflow-hidden rounded-[1rem] bg-surface">
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-foreground">{t.detailActivity}</p>
            </div>
            {evidence.length === 0 ? (
              <div className="px-4 pb-4 text-sm text-text-muted">{t.noActivity}</div>
            ) : (
              evidence.map((item, index) => (
                <div key={item.id}>
                  {index > 0 ? <div className="mx-4 h-px bg-surface-soft" /> : null}
                  <div className="px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium text-foreground">
                        {item.action === "done"
                          ? t.activityDone
                          : item.action === "skip"
                            ? t.activitySkip
                            : t.activityPause}
                      </p>
                      <p className="text-[12px] text-text-muted">
                        {formatLocaleDateTime(item.createdAt, locale)}
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-muted">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function DetailRow({
  icon,
  label,
  last = false,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  last?: boolean;
  value: string;
}) {
  return (
    <div className="px-4">
      <div className="flex items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3">
          <span className="text-text-muted">{icon}</span>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <span className="text-sm text-text-muted">{value}</span>
      </div>
      {!last ? <div className="h-px bg-surface-soft" /> : null}
    </div>
  );
}
