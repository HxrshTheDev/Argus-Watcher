import cron from "node-cron";
import { db, workflowsTable } from "@workspace/db";
import { logger } from "./logger";
import { runWorkflowById } from "./workflow-runner";

/* Convert trigger string → cron expression */
function parseTrigger(trigger: string): string | null {
  if (!trigger || trigger === "manual") return null;

  // daily:HH:MM
  const daily = trigger.match(/^daily:(\d{2}):(\d{2})$/);
  if (daily) {
    const h = parseInt(daily[1]!);
    const m = parseInt(daily[2]!);
    return `${m} ${h} * * *`;
  }

  // weekly:dayname
  const weekly = trigger.match(/^weekly:(\w+)$/);
  if (weekly) {
    const days: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    const day = days[weekly[1]!.toLowerCase()];
    if (day !== undefined) return `0 9 * * ${day}`;
  }

  // hourly
  if (trigger === "hourly") return "0 * * * *";

  return null;
}

const activeTasks = new Map<number, cron.ScheduledTask>();

export async function syncScheduler(): Promise<void> {
  try {
    const workflows = await db.select().from(workflowsTable);
    const scheduled = workflows.filter(w => w.enabled && w.trigger !== "manual");

    // Stop and remove workflows that are disabled or deleted
    for (const [id, task] of activeTasks) {
      if (!scheduled.find(w => w.id === id)) {
        task.stop();
        activeTasks.delete(id);
        logger.info({ workflowId: id }, "Scheduler: removed");
      }
    }

    // Schedule new ones
    for (const wf of scheduled) {
      if (activeTasks.has(wf.id)) continue;
      const expr = parseTrigger(wf.trigger);
      if (!expr) continue;
      if (!cron.validate(expr)) { logger.warn({ expr, workflowId: wf.id }, "Invalid cron expression"); continue; }

      const task = cron.schedule(expr, async () => {
        logger.info({ workflowId: wf.id, name: wf.name }, "Scheduler: running workflow");
        try {
          await runWorkflowById(wf.id);
        } catch (err) {
          logger.error({ err, workflowId: wf.id }, "Scheduler: workflow failed");
        }
      }, { timezone: "UTC" });

      activeTasks.set(wf.id, task);
      logger.info({ workflowId: wf.id, trigger: wf.trigger, cron: expr, name: wf.name }, "Scheduler: registered");
    }
  } catch (err) {
    logger.error({ err }, "Scheduler sync failed");
  }
}

export function getSchedulerStatus(): { scheduled: number; ids: number[] } {
  return { scheduled: activeTasks.size, ids: [...activeTasks.keys()] };
}

export function startScheduler(): void {
  syncScheduler();
  // Re-sync every 5 minutes to pick up changes
  setInterval(() => syncScheduler(), 5 * 60_000);
  logger.info("Workflow scheduler started");
}
