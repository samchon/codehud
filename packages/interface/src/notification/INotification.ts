import type { IHudFrame } from "../hud/IHudFrame";

/**
 * One request to spend the wearer's attention.
 *
 * The display sits in front of someone's eye while they walk, talk, and work,
 * so every time it lights up it takes attention from what they were actually
 * doing. A product that spends that carelessly gets taken off and left on a
 * desk.
 *
 * The grade is read from {@link IHudFrame.urgency} on the carried frame, so
 * composition and attention cannot disagree about whether the wearer is
 * interrupted.
 *
 * @evidence requirements/notification/attention-and-quiet.md#notification-three-grades Carries the graded frame, so every alert has exactly one grade and no alert is ungraded.
 * @evidence requirements/notification/attention-and-quiet.md#notification-names-session Carries the working directory every demand-grade alert must state, since an approval whose repository is unknown is not answerable.
 * @evidence specifications/notification/attention-contract.md#spec-notification-grade-permissions Types the grade the fixed permission table over waking and speaking is keyed by.
 * @evidence specifications/notification/attention-contract.md#spec-notification-session-addressing Types the addressing the specification makes mandatory at demand grade.
 * @author Samchon
 */
export interface INotification {
  /**
   * What the wearer is being told, already fitted for the display.
   *
   * The grade lives on the frame rather than beside it. A second copy here
   * could disagree with the one composition produced, and whichever the
   * delivery path happened to read would decide whether a wearer was woken.
   */
  frame: IHudFrame;

  /**
   * Session this concerns, as a working directory shortened from the left.
   *
   * Required on every demand-grade notification, because an approval whose
   * target repository is unknown is not answerable: "allow" means something
   * different in each one. Required on a notice as well when it concerns a
   * session other than the one in focus.
   */
  directory?: string;

  /**
   * Whether this is still waiting for the wearer.
   *
   * A pending approval stays pending through suppression, disconnection, and
   * any amount of elapsed time. Nothing in this product resolves one on the
   * wearer's behalf.
   */
  pending: boolean;
}
export namespace INotification {
  /**
   * What each grade is permitted to do, and how suppression changes it.
   *
   * Grade permissions are an upper bound on device behavior rather than a
   * request: an adapter may do less when the device cannot do more, never more
   * than the grade permits.
   *
   * @evidence requirements/notification/attention-and-quiet.md#notification-quiet-mode Removes waking and speech at every grade including demand, while leaving session state unchanged.
   * @evidence specifications/notification/attention-contract.md#spec-notification-quiet-suppression Types suppression as a presentation change that defers rather than discards.
   */
  export interface IQuiet {
    /**
     * Whether waking and speech are suppressed at every grade.
     *
     * A wearer in a meeting, a conversation, or a cinema silences the product
     * without stopping the work.
     */
    active: boolean;

    /**
     * Demand-grade notifications withheld while suppression was active.
     *
     * In arrival order, presented together when suppression ends. None is
     * dropped, coalesced away, or resolved by the system: an agent that was
     * waiting is still waiting.
     */
    deferred: INotification[];
  }

  /**
   * How a demand-grade notification reaches a wearer who is not at the glasses.
   *
   * The glasses are frequently not on the wearer's face. When the device is
   * disconnected, asleep beyond reach, or suppressed, the notification is
   * delivered through the host carrying the client instead.
   *
   * @evidence requirements/notification/attention-and-quiet.md#notification-fallback Delivers an unseen demand through the phone, and refuses to resolve an unanswered approval by elapsed time.
   * @evidence specifications/notification/attention-contract.md#spec-notification-fallback-delivery Types the host-side path and the prohibition on timeout-resolved approvals.
   */
  export interface IFallback {
    /**
     * Why the glasses could not present it.
     *
     * Recorded so a wearer who answers on the phone knows whether their glasses
     * are broken, asleep, or merely silenced.
     */
    reason: IFallback.Reason;

    /** The notification that could not be presented on the device. */
    notification: INotification;
  }
  export namespace IFallback {
    /**
     * The three ways the glasses can be unreachable.
     *
     * There is no fourth member for a timeout, because no approval is ever
     * resolved by elapsed time. Both defaults are wrong and the wrong one
     * cannot be undone.
     */
    export type Reason = "disconnected" | "asleep" | "quiet";
  }
}
