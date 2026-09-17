import type {
  ICodeHudAgentCommand,
  ICodeHudAgentEvent,
  ICodeHudAgentSession,
  ICodeHudBridgeProvider,
} from "@codehud/interface";

import { CodeHudBridgeFailure } from "./CodeHudBridgeFailure";
import type { ICodeHudSessionSubscriber } from "./ICodeHudSessionSubscriber";

/**
 * Owns every running session, what each one has produced, and who is watching.
 *
 * A class because it holds the sessions, and a facade controller for everything
 * about a session's lifetime that is not the harness's own business. It knows
 * nothing about remote calls: subscribers arrive as
 * {@link ICodeHudSessionSubscriber}, so retention, replay, and ordering are all
 * exercised without a socket.
 *
 * A session's lifetime is bound to this registry and to an explicit close.
 * Detaching a device removes it from the fan-out and does nothing else: the
 * harness keeps running, observations keep accumulating, and a pending approval
 * stays pending.
 *
 * @evidence requirements/session-continuity/reconnect-and-replay.md#session-outlives-socket Binds a session's lifetime to the bridge and to explicit closure rather than to any connection.
 * @evidence specifications/session-lifecycle/attach-and-replay.md#spec-session-detach-semantics Implements detachment as removal from the fan-out, with retention from the first observation and several simultaneous clients served independently.
 * @evidence specifications/session-lifecycle/attach-and-replay.md#spec-session-replay-convergence Resends from the counter a client names, in ascending order and without a gap, which is what makes the client's monotonic guard safe rather than lossy.
 * @evidence specifications/session-lifecycle/attach-and-replay.md#spec-session-advertised-population Advertises the sessions this bridge holds and nothing else, so no wearer is offered an attachment to a conversation no observation can be delivered for.
 * @author Samchon
 */
export class CodeHudSessionRegistry {
  private readonly records: Map<string, CodeHudSessionRegistry.IRecord> =
    new Map();

  /**
   * Takes ownership of an opened session and starts consuming its observations.
   *
   * Returns once the session is addressable, not once the harness has produced
   * anything. The pump runs detached because the caller is answering a remote
   * call and the session outlives that call by design.
   */
  public adopt(
    session: ICodeHudAgentSession,
    metadata: CodeHudSessionRegistry.IMetadata,
  ): void {
    const record: CodeHudSessionRegistry.IRecord = {
      session,
      metadata,
      events: [],
      sequence: 0,
      subscribers: new Map(),
      closed: false,
    };
    this.records.set(session.id, record);
    void this.pump(record);
  }

  /**
   * Subscribes a device to a session, replaying from the counter it names.
   *
   * The subscriber is registered before anything is awaited, and every delivery
   * to it goes through one serial queue. That ordering is the whole point: the
   * client discards an observation at or below the highest it has folded, so a
   * live observation overtaking a replayed one would not merely arrive early,
   * it would make the client drop everything the replay was for.
   */
  public attach(
    id: string,
    from: number,
    subscriber: ICodeHudSessionSubscriber,
  ): void {
    const record: CodeHudSessionRegistry.IRecord = this.demand(id);
    const queue: CodeHudSessionRegistry.IQueue = this.enroll(
      record,
      subscriber,
    );
    for (const event of record.events)
      if (event.sequence >= from) this.push(record, queue, event);
  }

  /**
   * Removes a device from every session it was watching.
   *
   * Never closes anything. Losing a connection is how a wearer walks out of
   * range, and it must not end the work they walked away from.
   */
  public detach(subscriber: ICodeHudSessionSubscriber): void {
    for (const record of this.records.values())
      record.subscribers.delete(subscriber);
  }

  /** Delivers one instruction to a session, refusing an unknown identifier. */
  public async send(id: string, command: ICodeHudAgentCommand): Promise<void> {
    await this.demand(id).session.send(command);
  }

  /**
   * Ends a session and releases its harness process.
   *
   * Idempotent, because a device and a shutdown handler may both reach for it.
   * The record is dropped before the harness is asked to stop, so a second call
   * answers as an unknown session rather than closing the same process twice.
   */
  public async close(id: string): Promise<void> {
    const record: CodeHudSessionRegistry.IRecord | undefined =
      this.records.get(id);
    if (record === undefined) return;
    record.closed = true;
    this.records.delete(id);
    await record.session.close();
  }

  /** Ends every session, for a bridge that is shutting down. */
  public async shutdown(): Promise<void> {
    await Promise.all([...this.records.keys()].map((id) => this.close(id)));
  }

  /** Advertises the running sessions a connecting device may attach to. */
  public list(): ICodeHudBridgeProvider.ISession[] {
    return [...this.records.values()].map((record) => ({
      id: record.session.id,
      ...(record.metadata.native === undefined
        ? {}
        : { native: record.metadata.native }),
      kind: record.metadata.kind,
      directory: record.metadata.directory,
      sequence: record.sequence,
    }));
  }

  /**
   * Looks a session up, refusing rather than returning nothing.
   *
   * Every caller here would otherwise repeat the same refusal, and an unknown
   * identifier is one of the four things the protocol admits refusing.
   */
  private demand(id: string): CodeHudSessionRegistry.IRecord {
    const record: CodeHudSessionRegistry.IRecord | undefined =
      this.records.get(id);
    if (record === undefined)
      throw CodeHudBridgeFailure.create(
        "session",
        `no session is running under ${id}`,
      );
    return record;
  }

  /** Registers a subscriber, or returns the queue it already holds. */
  private enroll(
    record: CodeHudSessionRegistry.IRecord,
    subscriber: ICodeHudSessionSubscriber,
  ): CodeHudSessionRegistry.IQueue {
    const existing: CodeHudSessionRegistry.IQueue | undefined =
      record.subscribers.get(subscriber);
    if (existing !== undefined) return existing;
    const queue: CodeHudSessionRegistry.IQueue = { tail: Promise.resolve() };
    record.subscribers.set(subscriber, queue);
    return queue;
  }

  /**
   * Chains one delivery behind whatever that subscriber is already owed.
   *
   * A rejection drops the subscriber and is never rethrown. The pump is the
   * only consumer of the harness's observations, so letting one unreachable
   * device surface an error here would stall the session for every other device
   * watching it.
   */
  private push(
    record: CodeHudSessionRegistry.IRecord,
    queue: CodeHudSessionRegistry.IQueue,
    event: ICodeHudAgentEvent,
  ): void {
    queue.tail = queue.tail
      .then(() => this.deliver(record, queue, event))
      .catch(() => undefined);
  }

  /**
   * Hands one observation to the subscriber that owns this queue.
   *
   * The queue is looked up rather than closed over, so a subscriber dropped
   * mid-chain stops receiving the rest of what was already queued for it.
   */
  private async deliver(
    record: CodeHudSessionRegistry.IRecord,
    queue: CodeHudSessionRegistry.IQueue,
    event: ICodeHudAgentEvent,
  ): Promise<void> {
    for (const [subscriber, held] of record.subscribers)
      if (held === queue) {
        await subscriber.deliver(event).catch(() => {
          record.subscribers.delete(subscriber);
        });
        return;
      }
  }

  /**
   * Consumes the harness's observations, stamping and retaining each one.
   *
   * The counter is the bridge's rather than the adapter's, so a harness with no
   * session concept of its own still multiplexes and replays correctly.
   *
   * It starts at zero, because the contract says so. An earlier version started
   * at one so that zero could mean "I hold nothing, send everything", which was
   * a convenience the specification had already ruled out and which this code
   * had a comment defending. The convenience survives anyway: a device names
   * the lowest counter it still needs, and one holding nothing names zero.
   */
  private async pump(record: CodeHudSessionRegistry.IRecord): Promise<void> {
    try {
      for await (const raw of record.session.events) {
        if (record.closed === true) return;
        const event: ICodeHudAgentEvent = {
          ...raw,
          session: record.session.id,
          sequence: record.sequence++,
        };
        // The harness names itself in its own first observation, after the
        // session is already addressable. Recording it here is what lets the
        // advertisement carry it: the field existed and nothing ever set it, so
        // a session opened from the glasses could not be resumed at a terminal.
        if (event.type === "session" && event.native !== undefined)
          record.metadata = { ...record.metadata, native: event.native };
        record.events.push(event);
        for (const [, queue] of record.subscribers)
          this.push(record, queue, event);
      }
    } catch {
      // The adapter owns reporting a harness that died, and does so as an error
      // observation on this same stream. Reaching here means the stream itself
      // ended badly, which leaves the retained observations intact and the
      // session closable, and leaves nothing to tell a device that the stream
      // did not already carry.
    }
  }
}
export namespace CodeHudSessionRegistry {
  /** What a session is, beyond the harness handle driving it. */
  export interface IMetadata {
    /** Harness family driving the session. */
    kind: ICodeHudBridgeProvider.ISession["kind"];

    /** Absolute working directory the session is operating in. */
    directory: string;

    /**
     * Identifier the harness itself uses for the conversation.
     *
     * Absent for a harness that reports none, which makes that session
     * bridge-only and unresumable at a terminal on the host machine.
     */
    native?: string;
  }

  /** One session, everything it has produced, and everyone watching it. */
  export interface IRecord {
    /** The harness handle this record drives. */
    session: ICodeHudAgentSession;

    /**
     * What the session is, for advertisement to a connecting device.
     *
     * Not readonly: the harness's own identifier arrives after the session has
     * been adopted, in its first observation.
     */
    metadata: IMetadata;

    /** Every observation produced, retained from the first for replay. */
    events: ICodeHudAgentEvent[];

    /** Counter the next observation will carry, and so the number produced. */
    sequence: number;

    /** Attached devices, each with the queue that keeps its order. */
    subscribers: Map<ICodeHudSessionSubscriber, IQueue>;

    /** Whether an explicit close has been accepted. */
    closed: boolean;
  }

  /**
   * One subscriber's serial delivery chain.
   *
   * An object rather than a bare promise, so the chain can be advanced in place
   * while the map still holds the same value as the subscriber's identity.
   */
  export interface IQueue {
    /** What this subscriber is still owed. */
    tail: Promise<void>;
  }
}
