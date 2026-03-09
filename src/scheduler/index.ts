export interface Scheduler {
  start(): Promise<void>;
}

export const createScheduler = (): Scheduler => ({
  async start() {
    // placeholder: schedule polling and task dispatch
  }
});
