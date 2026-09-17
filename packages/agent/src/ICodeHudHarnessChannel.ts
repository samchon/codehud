/**
 * One running harness process, as far as a session needs to know.
 *
 * The seam between driving a conversation and owning a child process. A session
 * reads parsed lines, writes parsed lines, and ends; it never learns that any
 * of that is a pipe, which is what lets the approval pairing, the instruction
 * translation, and the termination rules be exercised in memory.
 *
 * Named for harnesses rather than for one of them, because both speak line-
 * delimited JSON over stdio and neither needs anything else from a process.
 * It was Claude-specific until the Codex adapter arrived and wanted the same
 * three operations; a seam with two users is the point at which its name
 * should stop naming the first one.
 *
 * The same shape as the runner seam the harness probe uses, and for the same
 * reason: a test that depended on a real process would be measuring the
 * machine's install rather than this repository's logic.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-session-lifetime Represents the running harness a session drives, so the lifetime rules are stated against something other than a process handle.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-session-open Types the transport a session's observation stream, instruction delivery, and termination are expressed over.
 * @author Samchon
 */
export interface ICodeHudHarnessChannel {
  /**
   * Lines the harness printed, already parsed.
   *
   * Iterating consumes, and the iteration ends when the process does. A line
   * that could not be parsed never reaches here; the channel owns deciding what
   * to do with it, because only the channel knows whether the process is still
   * alive to produce a better one.
   */
  readonly lines: AsyncIterable<unknown>;

  /**
   * Hands one line to the harness.
   *
   * Resolves once the line has been written, not once the harness has acted on
   * it. Rejects when the process is gone, which a session reports rather than
   * swallows: an instruction a wearer gave that never arrived is not something
   * to be quiet about.
   */
  write(value: unknown): Promise<void>;

  /**
   * Ends the process.
   *
   * Idempotent, because a wearer closing a session and a bridge shutting down
   * may both reach for it.
   */
  close(): Promise<void>;
}
