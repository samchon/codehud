import type { ICodeHudAgentAdapter } from "@codehud/interface";

import type { ICodeHudHarnessRunner } from "./ICodeHudHarnessRunner";

/**
 * Finds out which coding agent harnesses this machine can actually run.
 *
 * Reports every family it knows, including the ones it could not use. A wearer
 * choosing between harnesses on a two-line display needs to be told that one is
 * missing, not handed a shorter list with no explanation, and the reason has to
 * name the executable rather than the family so that it is something they can
 * act on later at a keyboard.
 *
 * A class because it holds a collaborator. The probe asks the host machine two
 * questions and nothing else, through a seam, which is what lets every branch
 * here be exercised without either binary installed.
 *
 * @evidence requirements/agent-control/harness-abstraction.md#agent-harness-discovery Reports every harness family with either an identity or an executable-level reason, rather than dropping the unusable ones.
 * @evidence specifications/agent-harness/normalized-stream.md#spec-agent-probe-result Produces the result whose descriptor and reason are never both present and never both absent, and treats an unreported version as available without one.
 * @author Samchon
 */
export class CodeHudHarnessProbe {
  /** Constructs a probe bound to one way of reaching the host machine. */
  public constructor(private readonly runner: ICodeHudHarnessRunner) {}

  /**
   * Probes every harness family, in a stable order.
   *
   * The order is the declaration order rather than availability, so a wearer
   * who has both installed sees the same list every time and can learn its
   * shape. Probes run concurrently because they are independent and each one
   * costs a process launch.
   */
  public async probe(): Promise<ICodeHudAgentAdapter.IProbe[]> {
    return Promise.all(
      CodeHudHarnessProbe.FAMILIES.map((family) => this.one(family)),
    );
  }

  private async one(
    family: CodeHudHarnessProbe.IFamily,
  ): Promise<ICodeHudAgentAdapter.IProbe> {
    const executable: string | null = await this.runner
      .resolve(family.command)
      .catch(() => null);
    if (executable === null)
      return {
        kind: family.kind,
        reason: `${family.command} was not found on the PATH`,
      };

    // A harness that answers nothing, answers slowly, or exits non-zero is
    // still installed. Only a version that cannot be read is absent, and the
    // specification says an unreported version is not a reason to hide the
    // harness.
    const reported: string | null = await this.runner
      .version(executable, ["--version"])
      .catch(() => null);
    const version: string | undefined =
      reported === null ? undefined : CodeHudHarnessProbe.version(reported);

    return {
      kind: family.kind,
      descriptor: {
        kind: family.kind,
        title: family.title,
        executable,
        ...(version === undefined ? {} : { version }),
      },
    };
  }
}
export namespace CodeHudHarnessProbe {
  /**
   * One harness family and how to find it.
   *
   * Data rather than a subclass per harness, because discovery asks the same
   * two questions of every family and differs only in what it is looking for.
   * The families that follow differ in how they are driven, not in how they are
   * found.
   */
  export interface IFamily {
    /** Harness family this entry describes. */
    kind: ICodeHudAgentAdapter.IProbe["kind"];

    /** Command name to resolve on the path. */
    command: string;

    /** Human label rendered on the display when the wearer chooses. */
    title: string;
  }

  /**
   * The families this build knows about, in the order they are reported.
   *
   * Closed on purpose. Adding a member is adding an adapter, never a
   * configuration entry, because a family this list names but nothing can drive
   * is a choice that fails after the wearer has made it.
   */
  export const FAMILIES: readonly IFamily[] = Object.freeze([
    Object.freeze({
      kind: "claude-code" as const,
      command: "claude",
      title: "Claude Code",
    }),
    Object.freeze({
      kind: "codex" as const,
      command: "codex",
      title: "Codex",
    }),
  ]);

  /**
   * Extracts a version from whatever a harness prints when asked for one.
   *
   * The two supported harnesses answer in different shapes, verified against
   * the installed binaries rather than from documentation:
   *
   * ```text
   * claude --version   ->  2.1.274 (Claude Code)
   * codex --version    ->  codex-cli 0.154.0
   * ```
   *
   * So the rule is to take the first dotted numeric token anywhere in the
   * output rather than to match a position. A harness that prints no such token
   * reports no version, which the specification treats as available without one
   * rather than as a reason to hide it.
   *
   * Scanned rather than matched with a pattern. The obvious expression for a
   * dotted version nests one quantifier inside another, which is the shape that
   * backtracks catastrophically, and this reads a string a third-party binary
   * printed.
   */
  export const version = (reported: string): string | undefined => {
    for (const token of reported.split(/[\s(),[\]]+/u)) {
      const start: number = token.search(/[0-9]/u);
      if (start === -1) continue;
      const candidate: string = token.slice(start);
      // A prerelease or build suffix carries letters, so only the part before
      // the first separator has to be dotted digits. Requiring the whole token
      // to be numeric would report a release candidate as no version at all.
      const core: string = candidate.split(/[-+]/u)[0] ?? "";
      if (core.includes(".") === false) continue;
      if ([...core].every((c) => (c >= "0" && c <= "9") || c === "."))
        return candidate;
    }
    return undefined;
  };
}
