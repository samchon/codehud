/**
 * One instruction travelling from the wearer to a running coding agent.
 *
 * The inverse of {@link IAgentEvent}: a closed set of things a head-up display
 * and a touchpad can actually express, which is far smaller than what a
 * terminal can. Anything a wearer cannot do in one gesture or one sentence is
 * deliberately absent.
 *
 * @evidence requirements/agent-control/turn-and-approval.md#agent-wearer-commands Closes the instruction set to what one gesture or one confirmed sentence can express.
 * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-command-vocabulary Types the three-member instruction union the specification fixes.
 * @author Samchon
 */
export type IAgentCommand =
  IAgentCommand.IPrompt | IAgentCommand.IDecision | IAgentCommand.IInterrupt;
export namespace IAgentCommand {
  /**
   * Text, and optionally a photograph, submitted as a new turn.
   *
   * Dictation is the only practical text entry on glasses, so the prompt
   * arrives as finished speech rather than as keystrokes, and the client is
   * responsible for having let the wearer confirm it first.
   *
   * @evidence requirements/agent-control/turn-and-approval.md#agent-wearer-commands Carries the confirmed sentence and the photographs a desktop terminal cannot attach.
   * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-command-vocabulary Types the prompt member, excluding unconfirmed interim recognition.
   */
  export interface IPrompt {
    /** Discriminant of this command kind. */
    type: "prompt";

    /** Prompt text as the wearer confirmed it. */
    text: string;

    /**
     * Photographs to attach, each as a `data:` URL.
     *
     * Glasses carry a camera pointed at whatever the wearer is looking at,
     * which is the one input modality a desktop terminal cannot match; a
     * screen, a whiteboard, or a broken fixture becomes part of the prompt.
     */
    images?: string[];
  }

  /**
   * An answer to a pending approval request.
   *
   * Sent for exactly one request; a wearer who answers a request that already
   * timed out gets a rejection rather than an answer applied to the next one.
   *
   * @evidence requirements/agent-control/turn-and-approval.md#agent-permission-blocking Quotes the request identifier so an answer is never applied to a different request.
   * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-permission-pairing Types the answering half of the identifier pairing.
   */
  export interface IDecision {
    /** Discriminant of this command kind. */
    type: "decision";

    /** Identifier quoted from {@link IAgentEvent.IPermission.request}. */
    request: string;

    /** Identifier of the chosen {@link IAgentPermission}. */
    option: string;
  }

  /**
   * A request to stop the current turn.
   *
   * Kept as its own command rather than a decision because a wearer must be
   * able to stop an agent that is not asking anything, which is precisely when
   * stopping it matters most.
   *
   * @evidence requirements/product/charter.md#product-wearable-coding-agent Provides the fourth wearable operation, stopping a turn in flight, without leaving the glasses.
   * @evidence specifications/product-boundary/charter-refinement.md#spec-product-wearable-minimum Types the interruption the minimum capability set requires.
   */
  export interface IInterrupt {
    /** Discriminant of this command kind. */
    type: "interrupt";
  }
}
