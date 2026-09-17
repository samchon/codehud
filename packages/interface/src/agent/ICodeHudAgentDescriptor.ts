/**
 * Identity of a coding agent harness the bridge can drive.
 *
 * A descriptor is what a device sees before it opens anything: the glasses list
 * the harnesses a bridge actually found on the host machine, and the wearer
 * picks one. It carries no session state.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-harness-discovery Exposes the identity a discovered harness reports, including the executable a failure would name.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-probe-result Types the usable half of the discovery result the specification fixes.
 * @author Samchon
 */
export interface ICodeHudAgentDescriptor {
  /**
   * Stable machine key of the harness, unique within one bridge.
   *
   * Used as the selector in {@link ICodeHudAgentAdapter} lookups and in the wire
   * protocol, so it must stay constant across restarts of the same install.
   */
  kind: ICodeHudAgentDescriptor.Kind;

  /**
   * Human label rendered on the head-up display, such as `Claude Code`.
   *
   * Kept short because the display that shows it may be two lines wide.
   */
  title: string;

  /**
   * Version string reported by the harness executable, when it reports one.
   *
   * Absent when the executable was found but refused to answer a version
   * probe, which is not by itself a reason to hide the harness.
   */
  version?: string;

  /**
   * Absolute path of the executable the bridge resolved for this harness.
   *
   * Recorded so a wearer can tell two installs apart, and so a failure to
   * spawn can name the binary that failed rather than the harness family.
   */
  executable: string;
}
export namespace ICodeHudAgentDescriptor {
  /**
   * Closed set of harness families this project normalizes.
   *
   * Every member has a distinct control surface, so the set is closed on
   * purpose: adding a member is adding an adapter, never a configuration flag.
   *
   * @evidence requirements/product/charter.md#product-two-adapter-axes Closes the harness axis membership, so adding a member costs an adapter rather than a configuration flag.
   * @evidence specifications/product-boundary/charter-refinement.md#spec-product-axis-independence Types the harness axis key without referencing any device fact.
   */
  export type Kind = "claude-code" | "codex";
}
