import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";

import type { Project, Task, TaskBucket } from "./types";

export function getTaskBucket(task: Task, now = new Date()): TaskBucket {
  if (task.state === "done" || task.completedAt) {
    return "done";
  }

  if (!task.plannedDate) {
    return "backlog";
  }

  const taskDate = parseISO(task.plannedDate);
  const today = startOfDay(now);

  if (isSameDay(taskDate, today)) {
    return "today";
  }

  if (isSameDay(taskDate, addDays(today, 1))) {
    return "tomorrow";
  }

  if (isBefore(taskDate, today)) {
    return "overdue";
  }

  return "backlog";
}

export function countTodayOpenTasks(tasks: Task[], now = new Date()) {
  return tasks.filter((task) => getTaskBucket(task, now) === "today").length;
}

export function groupTasks(tasks: Task[], now = new Date()) {
  const buckets: Record<TaskBucket, Task[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    backlog: [],
    done: [],
  };

  tasks.forEach((task) => {
    buckets[getTaskBucket(task, now)].push(task);
  });

  return buckets;
}

export function getProjectStats(project: Project, tasks: Task[], now = new Date()) {
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const done = projectTasks.filter((task) => getTaskBucket(task, now) === "done").length;
  const today = projectTasks.filter((task) => getTaskBucket(task, now) === "today").length;
  const overdue = projectTasks.filter((task) => getTaskBucket(task, now) === "overdue").length;

  return {
    total: projectTasks.length,
    done,
    today,
    overdue,
    completionRate: projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0,
  };
}

export function getWeekBuckets(tasks: Task[], now = new Date()) {
  const start = startOfDay(now);
  const end = endOfDay(addDays(start, 6));

  return eachDayOfInterval({ start, end }).map((day) => {
    const planned = tasks.filter((task) => {
      if (!task.plannedDate || task.state === "done") {
        return false;
      }

      const plannedDate = parseISO(task.plannedDate);
      return isSameDay(plannedDate, day);
    });

    const done = tasks.filter((task) => {
      if (!task.completedAt) {
        return false;
      }

      return isSameDay(parseISO(task.completedAt), day);
    });

    return {
      date: format(day, "yyyy-MM-dd"),
      dayLabel: format(day, "EEE"),
      dayNumber: format(day, "d"),
      plannedCount: planned.length,
      doneCount: done.length,
      isPast: isBefore(day, start),
      isToday: isSameDay(day, start),
      hasLaterWork: planned.some((task) => {
        if (!task.plannedDate) {
          return false;
        }

        return isAfter(parseISO(task.plannedDate), start);
      }),
    };
  });
}
