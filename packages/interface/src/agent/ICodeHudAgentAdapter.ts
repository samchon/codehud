import type { ICodeHudAgentDescriptor } from "./ICodeHudAgentDescriptor";
import type { ICodeHudAgentSession } from "./ICodeHudAgentSession";

/**
 * Everything the project needs to know about one coding agent harness.
 *
 * One of the two adapter axes: this side absorbs the difference between
 * Claude Code and Codex, the device side absorbs the difference between
 * vendors, and the projection layer between them knows about neither. Nothing
 * here references a display geometry, an input gesture, or a manufacturer.
 *
 * @evidence requirements/product/charter.md#product-two-adapter-axes Bounds the harness axis so that adding a harness costs one adapter and nothing downstream of it.
 * @evidence specifications/product-boundary/charter-refinement.md#spec-product-axis-independence Types the harness axis with no reference to any device fact, which is the constraint the specification makes checkable.
 * @author Samchon
 */
export interface ICodeHudAgentAdapter {
  /** Identity of the harness this adapter drives. */
  readonly descriptor: ICodeHudAgentDescriptor;

  /**
   * Starts or resumes a conversation with the harness.
   *
   * Spawning the process is part of opening, so a failure to launch surfaces
   * here rather than as a fatal observation on a session that never began.
   */
  open(props: ICodeHudAgentAdapter.IOpenProps): Promise<ICodeHudAgentSession>;
}
export namespace ICodeHudAgentAdapter {
  /**
   * How a caller wants the harness launched.
   *
   * Deliberately small, because a wearer cannot compose a launch command by
   * voice. Everything beyond these is configured on the host machine.
   *
   * @evidence requirements/agent-control/turn-and-approval.md#agent-approval-budget Carries the approval policy at open, since a harness left at its defaults asks often enough to make the product unusable while walking.
   * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-permission-policy Types the policy as a property of one session rather than of the installation.
   */
  export interface IOpenProps {
    /**
     * Absolute working directory to launch the harness in.
     *
     * Required rather than defaulted. A coding agent pointed at the wrong
     * repository is the failure with the largest blast radius in this product,
     * and the bridge must never guess it.
     */
    directory: string;

    /**
     * How much of the harness's activity reaches the wearer.
     *
     * Stated when the work begins, because the right answer differs between a
     * scratch repository and one that deploys.
     */
    policy: IPolicy;

    /**
     * Prior session to resume instead of starting fresh.
     *
     * Resuming is the common case for glasses: a wearer walks away from a desk
     * mid-task and wants the same context, not a new one.
     */
    resume?: string;

    /**
     * Model to request, when the wearer chose one.
     *
     * Absent means the harness picks, which is what a wearer wants by default
     * since a two-line display is a poor place to compare models.
     */
    model?: string;
  }

  /**
   * How harness actions are partitioned between unattended and attended.
   *
   * The partition is the product's answer to approval fatigue: a wearer who is
   * stopped every few minutes cannot walk, cook, or hold a conversation, and a
   * wearer who is never stopped is not supervising anything.
   *
   * @evidence requirements/agent-control/turn-and-approval.md#agent-approval-budget Exposes the three classes the approval budget requires, with destructive actions separated from ordinary writes.
   * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-permission-policy Types the three-class partition and the defaults the specification assigns to each kind of action.
   */
  export interface IPolicy {
    /**
     * How each action class is treated, keyed by the class.
     *
     * A mapping rather than one list per treatment, so an action cannot appear
     * under two treatments at once. Three lists would let a policy say that
     * deletion both proceeds unattended and requires two confirmations, and
     * whichever one the implementation read first would become the answer.
     *
     * An action absent from the mapping is treated as {@link Treatment}
     * `attended`. The default is the cautious one because silently widening
     * the unattended set is the one mistake in this structure a wearer cannot
     * notice from the display.
     */
    actions: Partial<Record<IPolicy.Action, IPolicy.Treatment>>;
  }
  export namespace IPolicy {
    /**
     * Classes of harness action the policy partitions.
     *
     * Classes rather than tool names, because the two harnesses name their
     * tools differently and a policy written in one harness's vocabulary would
     * not survive the other.
     */
    export type Action =
      | "read"
      | "write"
      | "execute"
      | "network"
      | "delete"
      | "history"
      | "publish"
      | "credential";

    /**
     * What happens when an action of a given class comes up.
     *
     * `unattended` proceeds silently and suits reads. `attended` raises an
     * approval request and suits writes, executions, and anything leaving the
     * host machine. `confirmed` raises one and then requires a second,
     * differently worded confirmation, so that one misrecognized utterance
     * cannot satisfy both; deletion, history rewriting, force publication, and
     * credential exposure belong there.
     */
    export type Treatment = "unattended" | "attended" | "confirmed";
  }

  /**
   * Discovery result for one harness family on the host machine.
   *
   * Returned even when the harness is missing, so the bridge can tell a wearer
   * that a harness is not installed rather than quietly offering a shorter
   * list.
   *
   * @evidence requirements/agent-control/harness-abstraction.md#agent-harness-discovery Reports the unavailable harness with a reason instead of dropping it from the list.
   * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-probe-result Types the mutually exclusive descriptor and reason the specification requires.
   */
  export interface IProbe {
    /** Harness family that was probed. */
    kind: ICodeHudAgentDescriptor.Kind;

    /**
     * Descriptor of the harness, when it was found and answered.
     *
     * Absent exactly when {@link reason} explains why it could not be used.
     */
    descriptor?: ICodeHudAgentDescriptor;

    /**
     * Why the harness is unavailable, when it is.
     *
     * Names the executable that failed rather than the harness family, because
     * the wearer acts on this later at a keyboard.
     */
    reason?: string;
  }
}
