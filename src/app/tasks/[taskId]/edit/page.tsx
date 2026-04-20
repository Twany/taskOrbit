import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { TaskEditForm } from "@/components/task-edit-form";
import { getDictionary } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale.server";
import { getTaskById } from "@/lib/repository";
import { getTaskBucket } from "@/lib/task-groups";

export default async function TaskEditPage({
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

  const { dashboard, task } = result;
  const bucket = getTaskBucket(task);

  return (
    <main className="flex min-h-screen items-start justify-center px-0 py-0 sm:px-6 sm:py-10">
      <div className="device-shadow flex min-h-screen w-full max-w-[430px] flex-col bg-background sm:min-h-[860px] sm:rounded-[2.15rem]">
        <header className="safe-pt flex items-center justify-between px-5 pb-4 pt-6">
          <Link className="pressable rounded-[0.85rem] px-2 py-2 text-foreground" href={`/tasks/${taskId}`}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <p className="text-sm font-semibold text-foreground">{t.editTask}</p>
          <span className="w-9" />
        </header>

        <section className="flex-1 px-5 pb-10 pt-2">
          <TaskEditForm
            initialBucket={
              bucket === "overdue" ? "today" : bucket
            }
            locale={locale}
            projects={dashboard.projects}
            task={task}
            weeklyRepeatWeekday={dashboard.weeklyRepeatWeekday}
          />
        </section>
      </div>
    </main>
  );
}
