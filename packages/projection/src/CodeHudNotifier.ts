import type {
  ICodeHudFrame,
  ICodeHudNotification,
  ICodeHudState,
} from "@codehud/interface";

/**
 * Decides what a device is permitted to do about a frame, and what it owes the
 * wearer later.
 *
 * A class because quiet mode is state and the items it defers accumulate. The
 * decisions themselves are pure: the same frame under the same mode always
 * yields the same permissions, which is what lets every rule here be checked
 * without a device.
 *
 * What it returns is an upper bound, never an instruction. A device that cannot
 * speak does less; nothing may do more.
 *
 * @evidence requirements/notification/attention-and-quiet.md#notification-three-grades Fixes what each of the three grades permits, so a device adapter reads permissions rather than inventing them.
 * @evidence requirements/notification/attention-and-quiet.md#notification-quiet-mode Suppresses waking and speech at every grade while leaving the session untouched, and holds what was suppressed.
 * @evidence requirements/notification/attention-and-quiet.md#notification-fallback Routes a demand-grade item the wearer cannot see to the host that carries the client.
 * @evidence specifications/notification/attention-contract.md#spec-notification-grade-permissions Implements the permission table over waking and speaking, with no assignment outside the three grades.
 * @evidence specifications/notification/attention-contract.md#spec-notification-quiet-suppression Defers rather than discards, in order, and presents what accumulated when quiet mode ends.
 * @evidence specifications/notification/attention-contract.md#spec-notification-fallback-delivery Produces a host-side delivery for what the wearer cannot be shown, and resolves nothing by elapsed time.
 * @author Samchon
 */
export class CodeHudNotifier {
  private quiet: boolean = false;
  private readonly held: ICodeHudNotification[] = [];

  /**
   * What a device may do about this frame, and what it owes instead.
   *
   * A suppressed or unreachable demand-grade item is deferred and routed to the
   * host at the same time: one is what the wearer will see when they come back,
   * the other is what reaches them before then. Neither resolves anything.
   */
  public present(
    frame: ICodeHudFrame,
    state: ICodeHudState,
    props: CodeHudNotifier.IPresence = {},
  ): CodeHudNotifier.IPermission {
    const notification: ICodeHudNotification = {
      frame,
      ...(state.session === undefined
        ? {}
        : { directory: state.session.directory }),
      pending: state.pending !== undefined,
    };

    const reachable: boolean = props.reachable !== false;
    const allowed: CodeHudNotifier.IPermission =
      this.quiet === true || reachable === false
        ? { wake: false, speak: false }
        : CodeHudNotifier.PERMISSIONS[frame.urgency];

    if (frame.urgency !== "demand") return allowed;

    // Demand is the only grade with anywhere else to go. An approval the wearer
    // cannot see still blocks its session, so it has to reach them another way
    // and be waiting for them when they return.
    const reason: ICodeHudNotification.IFallback.Reason | undefined =
      this.quiet === true
        ? "quiet"
        : reachable === false
          ? props.asleep === true
            ? "asleep"
            : "disconnected"
          : undefined;
    if (reason === undefined) return allowed;

    this.held.push(notification);
    return { ...allowed, fallback: { reason, notification } };
  }

  /**
   * Enters or leaves quiet mode.
   *
   * Leaving returns everything that accumulated while it was on, in the order
   * it arrived. Nothing is dropped, nothing is coalesced, and nothing has been
   * answered on the wearer's behalf: the sessions those items belong to are
   * exactly where they were left.
   */
  public silence(active: boolean): ICodeHudNotification[] {
    const was: boolean = this.quiet;
    this.quiet = active;
    if (active === true || was === false) return [];
    return this.held.splice(0, this.held.length);
  }

  /** Whether waking and speech are currently suppressed. */
  public get silenced(): boolean {
    return this.quiet;
  }

  /** What is waiting to be shown, without taking it. */
  public get waiting(): ICodeHudNotification.IQuiet {
    return { active: this.quiet, deferred: [...this.held] };
  }
}
export namespace CodeHudNotifier {
  /**
   * What each grade permits, and nothing beyond it.
   *
   * Demand may wake a sleeping display and may speak. Notice may wake and may
   * not speak. Ambient may do neither. There is no fourth grade and no content
   * without one, so this table is total and a lookup that missed would be a
   * defect rather than a default.
   */
  export const PERMISSIONS: Readonly<
    Record<ICodeHudFrame["urgency"], IPermission>
  > = Object.freeze({
    demand: Object.freeze({ wake: true, speak: true }),
    notice: Object.freeze({ wake: true, speak: false }),
    ambient: Object.freeze({ wake: false, speak: false }),
  });

  /** What a device may do, and what it owes if it cannot. */
  export interface IPermission {
    /** Whether a sleeping display may be woken for this. */
    wake: boolean;

    /** Whether this may be spoken aloud. */
    speak: boolean;

    /**
     * Where this has to go instead, when the wearer cannot be shown it.
     *
     * Only ever present for demand. A wearer who missed an ambient progress
     * line has missed nothing; a wearer who missed an approval is blocking
     * their own agent without knowing it.
     */
    fallback?: ICodeHudNotification.IFallback;
  }

  /** Whether the wearer can currently be shown anything. */
  export interface IPresence {
    /**
     * Whether the device is connected and able to display.
     *
     * Absent means yes, which is the ordinary case and the one a desktop
     * simulator is always in.
     */
    reachable?: boolean;

    /**
     * Whether being unreachable is the display sleeping rather than the
     * connection being gone.
     *
     * Only distinguishes the reason reported to the host, because the two are
     * the same to a wearer and different to whoever reads the log.
     */
    asleep?: boolean;
  }
}
