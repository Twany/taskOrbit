import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  CircleCheckBig,
  FolderKanban,
  ListTodo,
  TriangleAlert,
} from "lucide-react";

import { formatLocaleDate, getDictionary } from "@/lib/locale";
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

  const { task, project } = result;
  const bucket = getTaskBucket(task);

  return (
    <main className="flex min-h-screen items-start justify-center px-0 py-0 sm:px-6 sm:py-10">
      <div className="device-shadow flex min-h-screen w-full max-w-[430px] flex-col bg-background sm:min-h-[860px] sm:rounded-[2.15rem]">
        <header className="safe-pt flex items-center justify-between px-5 pb-4 pt-6">
          <Link className="pressable rounded-[0.85rem] px-2 py-2 text-foreground" href="/">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <p className="text-sm font-semibold text-foreground">{t.task}</p>
          <span className="w-9" />
        </header>

        <section className="flex-1 px-5 pb-10 pt-2">
          <h1 className="text-[1.7rem] font-semibold tracking-[-0.05em] text-foreground">
            {task.title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-text-muted">
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
              value={
                task.repeatType === "daily"
                  ? t.daily
                  : task.repeatType === "weekdays"
                    ? t.weekdays
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
        </section>
      </div>
    </main>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-surface-soft px-4 py-4 last:border-b-0">
      <div className="flex items-center gap-3">
        <span className="text-text-muted">{icon}</span>
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <span className="text-sm text-text-muted">{value}</span>
    </div>
  );
}
