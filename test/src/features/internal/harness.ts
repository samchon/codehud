import type { ICodeHudSessionSubscriber } from "@codehud/bridge";
import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentCommand,
  ICodeHudAgentEvent,
  ICodeHudAgentSession,
} from "@codehud/interface";
import { setImmediate as tick } from "node:timers/promises";

/**
 * Stands in for a harness, so bridge rules can be exercised without a process.
 *
 * The bridge's job is bookkeeping: stamping counters, retaining what was
 * produced, replaying from where a device asks, and never letting one device
 * stall another. None of that needs a real agent, and a suite that launched one
 * would be measuring the agent instead of the bookkeeping.
 *
 * Observations are pushed by the test rather than produced on a schedule, so
 * every case states exactly what the harness had said by the time it asserts.
 */
export namespace Harness {
  /**
   * The policy a case states when the policy is not what it is about.
   *
   * Named rather than repeated inline, because it is a required part of what a
   * session *is* and most cases have no opinion about it. A case that does have
   * one says so by passing its own, which is then visibly the point of that
   * case rather than scenery.
   */
  export const POLICY: ICodeHudAgentAdapter.IPolicy = Object.freeze({
    actions: Object.freeze({
      read: "unattended",
      write: "attended",
      execute: "attended",
      network: "attended",
      delete: "confirmed",
      history: "confirmed",
      publish: "confirmed",
      credential: "confirmed",
    }),
  });

  /**
   * A session whose observations the test supplies one at a time.
   *
   * The stream stays open until {@link Session.end} is called, which is what a
   * running harness looks like: a session with nothing left to say is still a
   * session, and closing it is an instruction rather than an inference.
   */
  export class Session implements ICodeHudAgentSession {
    /** Instructions this session was handed, in order. */
    public readonly received: ICodeHudAgentCommand[] = [];

    /** How many times this session was asked to close. */
    public closed: number = 0;

    private readonly pending: ICodeHudAgentEvent[] = [];
    private wake: (() => void) | null = null;
    private finished: boolean = false;

    public constructor(public readonly id: string) {}

    public get events(): AsyncIterable<ICodeHudAgentEvent> {
      return {
        [Symbol.asyncIterator]: (): AsyncIterator<ICodeHudAgentEvent> => ({
          next: async (): Promise<IteratorResult<ICodeHudAgentEvent>> => {
            for (;;) {
              const head: ICodeHudAgentEvent | undefined = this.pending.shift();
              if (head !== undefined) return { done: false, value: head };
              if (this.finished === true)
                return { done: true, value: undefined };
              await new Promise<unknown>((resolve) => {
                this.wake = (): void => resolve(undefined);
              });
            }
          },
        }),
      };
    }

    /**
     * Whether the next instruction fails to arrive.
     *
     * A delivery that does not land is the case that separates settling an
     * answer on delivery from settling it on hope: the wearer still owes the
     * answer, and the question has to stay in front of them.
     */
    public refuseNext: boolean = false;

    public async send(command: ICodeHudAgentCommand): Promise<void> {
      if (this.refuseNext === true) {
        this.refuseNext = false;
        throw new Error("the instruction did not reach the harness");
      }
      this.received.push(command);
    }

    public async close(): Promise<void> {
      this.closed += 1;
      this.end();
    }

    /**
     * Produces one observation.
     *
     * The counter and the session identifier are deliberately wrong here: the
     * bridge stamps both, and leaving the adapter's values in place is how a
     * case proves the bridge stamped them rather than passed them through.
     */
    public emit(delta: string): void {
      this.pending.push({
        type: "message",
        session: "adapter-said-this",
        sequence: -1,
        at: 0,
        delta,
        complete: false,
      });
      this.wake?.();
      this.wake = null;
    }

    /**
     * Produces an approval request the wearer has to answer.
     *
     * Carries the two options a harness of this family offers, stated rather
     * than inferred, because the projection boundary assigns spoken inputs from
     * the declared properties and never from the label text.
     */
    public ask(request: string, title: string, detail?: string): void {
      this.pending.push({
        type: "permission",
        session: "adapter-said-this",
        sequence: -1,
        at: 0,
        request,
        title,
        ...(detail === undefined ? {} : { detail }),
        options: [
          { id: "yes", label: "Allow", affirmative: true, persistent: false },
          { id: "no", label: "Deny", affirmative: false, persistent: false },
        ],
      });
      this.wake?.();
      this.wake = null;
    }

    /**
     * Announces the session, naming the harness's own conversation.
     *
     * A real harness says this in its first observation rather than when it is
     * launched, which is why the identifier has to travel on an observation
     * instead of being handed over at adoption.
     */
    public announce(native?: string): void {
      this.pending.push({
        type: "session",
        session: "adapter-said-this",
        sequence: -1,
        at: 0,
        model: "opus",
        directory: "/repo",
        resumed: false,
        ...(native === undefined ? {} : { native }),
      });
      this.wake?.();
      this.wake = null;
    }

    /** Ends the observation stream without closing the session. */
    public end(): void {
      this.finished = true;
      this.wake?.();
      this.wake = null;
    }
  }

  /**
   * Records what was delivered to one attached device.
   *
   * Delivery yields before it records, which is not decoration. A real delivery
   * crosses a socket and therefore suspends, and a device that returned without
   * ever suspending would preserve ordering by accident: the bridge could drop
   * its per-device serialization entirely and this fixture would not notice.
   * That was the first version of this class, and it made the ordering case
   * green against a bridge that had no ordering.
   */
  export class Device implements ICodeHudSessionSubscriber {
    /** Counters recorded, in the order they arrived. */
    public readonly seen: number[] = [];

    /**
     * How many times the bridge tried to deliver to this device.
     *
     * Counted because it is the only way a dropped device is observable: what a
     * broken device has *seen* is empty whether the bridge gave up on it or
     * kept failing at it forever, and those are different bridges.
     */
    public attempts: number = 0;

    /**
     * Constructs a device, optionally broken or unevenly slow.
     *
     * A device that rejects every delivery is the case that matters most for
     * the fan-out: the bridge must drop it and keep serving everyone else,
     * because a harness stalled by an unreachable pair of glasses is a harness
     * nobody can use.
     *
     * The latency is how many turns a delivery takes, per observation. A
     * constant is useless for proving order, because turns are handed out in
     * the order they were asked for, so even an unserialized bridge would come
     * out sorted. {@link Device.REPLAY_IS_SLOWER} is the shape that actually
     * discriminates, and it is the shape a real connection has.
     */
    public constructor(
      private readonly broken: boolean = false,
      private readonly latency: (event: ICodeHudAgentEvent) => number = () => 1,
    ) {}

    public async deliver(event: ICodeHudAgentEvent): Promise<void> {
      this.attempts += 1;
      for (let i: number = 0; i < this.latency(event); ++i) await tick();
      if (this.broken === true) throw new Error("this device is gone");
      this.seen.push(event.sequence);
    }
  }

  export namespace Device {
    /**
     * Older observations take longer to deliver than newer ones.
     *
     * The hazard this models is real and is the reason the bridge serializes
     * per device at all. Catching up sends a burst of retained observations
     * while the harness is still producing, so the replay is the slow write and
     * the live observation behind it is the fast one. A bridge that fired
     * deliveries off in parallel would land the newest first, and the client
     * discards anything at or below what it has folded, which means the replay
     * it asked for would be thrown away on arrival.
     *
     * The numbers only have to be decreasing and to fit inside what
     * {@link settle} drains. Four observations cost fourteen turns in a
     * serialized fan-out, and would land exactly reversed without one.
     */
    export const REPLAY_IS_SLOWER = (event: ICodeHudAgentEvent): number =>
      Math.max(1, 6 - event.sequence);
  }

  /** An adapter that hands out prepared sessions, or refuses to. */
  export class Adapter implements ICodeHudAgentAdapter {
    /** Properties each open was called with, in order. */
    public readonly opened: ICodeHudAgentAdapter.IOpenProps[] = [];

    public constructor(
      public readonly descriptor: ICodeHudAgentAdapter["descriptor"],
      private readonly answer: Session | (() => never),
    ) {}

    public async open(
      props: ICodeHudAgentAdapter.IOpenProps,
    ): Promise<ICodeHudAgentSession> {
      this.opened.push(props);
      return typeof this.answer === "function" ? this.answer() : this.answer;
    }
  }

  /**
   * Lets every queued delivery run before the case asserts.
   *
   * Each tick drains the whole microtask queue, which is what is needed here:
   * the registry chains deliveries onto a promise per device, and the pump
   * itself suspends on an async iterator, so the work spans more turns than
   * counting `Promise.resolve()` can be relied on to cover. Counting them was
   * the first attempt and it came up short, which is a flaky suite rather than
   * a slow one.
   *
   * This is not a wait for a timer. `setImmediate` resolves in the same loop
   * iteration, so twenty of them cost microseconds and the whole bridge suite
   * stays far inside the per-case budget. Twenty rather than the handful the
   * longest chain needs, because a delivery now yields as a real one would and
   * a margin costs nothing where a shortfall is a flaky suite.
   */
  export const settle = async (ticks: number = 20): Promise<void> => {
    for (let i: number = 0; i < ticks; ++i) await tick();
  };

  /**
   * Runs a call and hands back what it refused with, or undefined if it did not.
   *
   * `Assert.throws` reports that something was thrown but does not return
   * it, and every refusal case here is about the refusal's own contents: which
   * of the four causes it carries and whether its message is something a wearer
   * could act on.
   */
  export const refusal = (task: () => Promise<unknown>): Promise<unknown> =>
    task()
      .then((): unknown => undefined)
      .catch((thrown: unknown) => thrown);
}
