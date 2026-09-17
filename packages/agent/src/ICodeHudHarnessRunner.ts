/**
 * The one thing harness discovery needs from the operating system.
 *
 * Injected rather than imported so the probe's logic can be exercised entirely
 * in memory. The development rules forbid launching a harness process from a
 * test, and a probe that reached for `child_process` directly would leave its
 * every branch reachable only by having a particular binary installed, which
 * is not a test but a property of the machine.
 *
 * Two operations, because discovery asks the system exactly two questions:
 * where does this command live, and what does it say when asked its version.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-harness-discovery Narrows what discovery asks the host machine to resolving a command and reading its version, so an unavailable harness is a reported result rather than a thrown failure.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-probe-result Types the seam the probe result is produced from, which is what lets both the available and the unavailable case be exercised without a binary installed.
 * @author Samchon
 */
export interface ICodeHudHarnessRunner {
  /**
   * Resolves a command name to an absolute path, or reports that it is absent.
   *
   * Absence is a result rather than a failure. A wearer with only one harness
   * installed is a supported configuration, and the probe reports the other one
   * as unavailable with a reason.
   */
  resolve(command: string): Promise<string | null>;

  /**
   * Runs a resolved executable with the given arguments and returns its output.
   *
   * Merges the two output streams, because a harness that prints its version to
   * standard error is reporting a version, not failing.
   */
  version(executable: string, args: string[]): Promise<string>;
}
