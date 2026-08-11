import { startScheduler } from "./lib/scheduler";

export async function init() {
  await startScheduler();
}
