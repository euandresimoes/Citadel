export interface HubEvent {
  id: string;
  type: string;
  data: unknown;
}

export type HubEventListener = (event: HubEvent) => void;

export class HubEventBus {
  private readonly events: HubEvent[] = [];
  private readonly listeners = new Set<HubEventListener>();

  public publish(event: HubEvent): void {
    this.events.push(event);
    if (this.events.length > 100) this.events.shift();
    for (const listener of this.listeners) listener(event);
  }

  public subscribe(listener: HubEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public since(lastEventId?: string): HubEvent[] {
    if (!lastEventId) return [...this.events];
    const index = this.events.findIndex((event) => event.id === lastEventId);
    return index < 0 ? [] : this.events.slice(index + 1);
  }
}
