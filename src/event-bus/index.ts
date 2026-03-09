export interface EventBus {
  emit(event: string, payload?: unknown): void;
}

export interface EventBusModule {
  createBus(): EventBus;
}

export const createEventBusModule = (): EventBusModule => ({
  createBus() {
    return {
      emit(_event, _payload) {
        // placeholder: publish events to subscribers
      }
    };
  }
});
