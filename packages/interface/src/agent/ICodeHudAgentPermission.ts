/**
 * One answer a wearer may give to a pending approval request.
 *
 * Harnesses differ in how many answers they offer and what each one means, so
 * the option list is data rather than a fixed enumeration; the display renders
 * whatever the adapter reports.
 *
 * @evidence requirements/agent-control/turn-and-approval.md#agent-permission-options Exposes each answer as data that states its own advancing and persisting properties.
 * @evidence specifications/agent-harness/control-and-approval.md#spec-agent-option-self-description Types the self-describing option the specification requires instead of a fixed enumeration.
 * @author Samchon
 */
export interface ICodeHudAgentPermission {
  /**
   * Opaque identifier the adapter uses to route the answer back.
   *
   * The device never interprets it; it echoes the value in
   * {@link ICodeHudAgentCommand.IDecision.optionId}.
   */
  id: string;

  /**
   * Label rendered for the wearer, such as `Allow` or `Deny`.
   *
   * Written to fit a narrow display, so it is a verb, not a sentence.
   */
  label: string;

  /**
   * Whether choosing this answer lets the agent proceed.
   *
   * The reducer uses it to place the affirmative answer under the primary
   * gesture on every device, independent of the order the harness listed them.
   */
  affirmative: boolean;

  /**
   * Whether the answer also persists for later requests of the same shape.
   *
   * A wearer cannot read a consent scope on a head-up display, so a persisting
   * answer is marked and rendered distinctly rather than silently applied.
   */
  persistent: boolean;
}
