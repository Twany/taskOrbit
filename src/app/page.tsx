import { TaskOrbitApp } from "@/components/task-orbit-app";
import { getRequestLocale } from "@/lib/locale.server";
import { getDashboardData } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const dashboardData = await getDashboardData();
  const locale = await getRequestLocale();

  return <TaskOrbitApp initialData={dashboardData} initialLocale={locale} />;
}
