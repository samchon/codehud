import {
  CodeHudHarnessProbe,
  type ICodeHudHarnessRunner,
} from "@codehud/agent";
import type { ICodeHudAgentAdapter } from "@codehud/interface";

import { Assert } from "../internal/assert";

/**
 * Discovery reports every harness family, including the ones it cannot use.
 *
 * A wearer choosing on a two-line display has to be told that a harness is
 * missing rather than handed a shorter list, and the reason has to name the
 * executable so it is something they can act on later at a keyboard.
 *
 * The host machine is reached through an injected seam, so every branch here is
 * exercised without either binary installed. A test that depended on what
 * happens to be on the machine would be measuring the machine.
 *
 * Scenarios:
 *
 * 1. Both families resolving yields two descriptors with versions, in the
 *    declaration order rather than in the order they answered, so the list a
 *    wearer learns is stable.
 * 2. A family that does not resolve yields a reason naming the command, and no
 *    descriptor. The negative twin of scenario 1.
 * 3. Descriptor and reason are never both present and never both absent, which
 *    is the invariant the specification states and the one a caller relies on
 *    to decide what to render.
 * 4. A resolver that throws does not propagate, since one unreachable path must
 *    not hide the other harness, and does not claim absence either. A broken
 *    PATH, an unreadable directory, and a permission failure are all reasons a
 *    wearer would act on differently from "not installed".
 * 5. A harness that resolves but cannot report a version is available without
 *    one. An unreported version is not a reason to hide a working harness.
 * 6. A harness whose version output holds no version is the same case, reached
 *    a different way.
 */
export async function test_agent_probe(): Promise<void> {
  const runner = (
    resolved: Record<string, string | null | Error>,
    printed: Record<string, string | Error> = {},
  ): ICodeHudHarnessRunner => ({
    resolve: async (command) => {
      const value = resolved[command];
      if (value instanceof Error) throw value;
      return value ?? null;
    },
    version: async (executable) => {
      const value = printed[executable];
      if (value === undefined) throw new Error("printed nothing");
      if (value instanceof Error) throw value;
      return value;
    },
  });

  const both: ICodeHudAgentAdapter.IProbe[] = await new CodeHudHarnessProbe(
    runner(
      { claude: "/usr/bin/claude", codex: "/usr/bin/codex" },
      {
        "/usr/bin/claude": "2.1.274 (Claude Code)",
        "/usr/bin/codex": "codex-cli 0.154.0",
      },
    ),
  ).probe();

  Assert.equals("one entry per family", both.length, 2);
  Assert.equals("declaration order", both[0]!.kind, "claude-code");
  Assert.equals("declaration order", both[1]!.kind, "codex");
  Assert.equals(
    "descriptor carries the resolved path",
    both[0]!.descriptor?.executable,
    "/usr/bin/claude",
  );
  Assert.equals(
    "and the parsed version",
    both[0]!.descriptor?.version,
    "2.1.274",
  );
  Assert.equals(
    "and the codex version, in its own shape",
    both[1]!.descriptor?.version,
    "0.154.0",
  );
  Assert.equals("no reason when usable", both[0]!.reason, undefined);

  const half: ICodeHudAgentAdapter.IProbe[] = await new CodeHudHarnessProbe(
    runner(
      { claude: null, codex: "/usr/bin/codex" },
      {
        "/usr/bin/codex": "codex-cli 0.154.0",
      },
    ),
  ).probe();
  Assert.equals("the absent one is still reported", half.length, 2);
  Assert.equals("no descriptor", half[0]!.descriptor, undefined);
  Assert.predicate(
    "the reason names the command, not the family",
    half[0]!.reason?.includes("claude") === true &&
      half[0]!.reason?.includes("Claude Code") === false,
  );
  Assert.equals("the other survives", half[1]!.descriptor?.version, "0.154.0");

  for (const probe of [...both, ...half])
    Assert.predicate(
      `${probe.kind}: exactly one of descriptor and reason`,
      (probe.descriptor === undefined) !== (probe.reason === undefined),
    );

  const throwing: ICodeHudAgentAdapter.IProbe[] = await new CodeHudHarnessProbe(
    runner(
      { claude: new Error("PATH unreadable"), codex: "/usr/bin/codex" },
      {
        "/usr/bin/codex": "codex-cli 0.154.0",
      },
    ),
  ).probe();
  Assert.equals(
    "a throwing resolver leaves the harness unusable",
    throwing[0]!.descriptor,
    undefined,
  );
  Assert.predicate(
    "and says it could not look, rather than that nothing is there",
    throwing[0]!.reason?.includes("PATH unreadable") === true &&
      throwing[0]!.reason?.includes("was not found") === false,
  );
  Assert.equals(
    "and does not hide the other harness",
    throwing[1]!.descriptor?.version,
    "0.154.0",
  );

  const mute: ICodeHudAgentAdapter.IProbe[] = await new CodeHudHarnessProbe(
    runner({ claude: "/usr/bin/claude", codex: null }),
  ).probe();
  Assert.equals(
    "a silent harness is still available",
    mute[0]!.descriptor?.executable,
    "/usr/bin/claude",
  );
  Assert.equals("without a version", mute[0]!.descriptor?.version, undefined);
  Assert.equals("and without a reason", mute[0]!.reason, undefined);

  const noisy: ICodeHudAgentAdapter.IProbe[] = await new CodeHudHarnessProbe(
    runner(
      { claude: "/usr/bin/claude", codex: null },
      {
        "/usr/bin/claude": "a friendly greeting with no numbers",
      },
    ),
  ).probe();
  Assert.equals(
    "output without a version reads the same way",
    noisy[0]!.descriptor?.version,
    undefined,
  );
  Assert.equals(
    "and still leaves the harness usable",
    noisy[0]!.descriptor?.executable,
    "/usr/bin/claude",
  );
}
