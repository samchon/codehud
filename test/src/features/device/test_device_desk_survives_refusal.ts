import { CodeHudBridgeServer } from "@codehud/bridge";
import type { ICodeHudAgentAdapter } from "@codehud/interface";
import { CodeHudDeskCommand } from "@codehud/simulator";
import { TestValidator } from "@nestia/e2e";

import { Harness } from "../internal/harness";

/**
 * An instruction that cannot be delivered does not end the run.
 *
 * The desk host reads utterances in a loop and hands each one to the client.
 * Every delivery can be refused: the bridge refuses four things by contract, a
 * session refuses an answer to a request it is no longer waiting on, and a
 * connection being re-established refuses everything for as long as that takes.
 * Until this case existed, any one of those left the loop as an unhandled
 * rejection and **ended the host** — out from under a wearer who had done
 * nothing but speak at the wrong moment, and most reliably during the second
 * after a reconnection began, which is exactly when they would try again.
 *
 * The case does the rude thing on purpose: it takes the bridge away while the
 * host is running and then speaks. What must survive is the host, and what must
 * happen is that the wearer is told.
 *
 * It is the first case to drive {@link CodeHudDeskCommand} at all. That file
 * states that every rule it obeys lives elsewhere, and that is still true of
 * the routing, the folding, the composing and the grading — but "a refused
 * instruction is reported and the loop continues" is a rule, it lives here, and
 * a rule nothing exercises is a rule nothing keeps.
 *
 * Scenarios:
 *
 * 1. The host connects, opens the session it was told to, and draws.
 * 2. The bridge goes away. Nothing about the host's own state changes: it is
 *    still reading, and the wearer is still owed an answer when they speak.
 * 3. An utterance carried to a bridge that is gone is reported to the wearer
 *    rather than thrown out of the run.
 * 4. The host is still reading afterwards, which is the whole point: a second
 *    utterance is still taken.
 */
export async function test_device_desk_survives_refusal(): Promise<void> {
  const session: Harness.Session = new Harness.Session("s1");
  const bridge: CodeHudBridgeServer = new CodeHudBridgeServer({
    adapters: new Map<
      ICodeHudAgentAdapter.IProbe["kind"],
      ICodeHudAgentAdapter
    >([
      [
        "claude-code",
        new Harness.Adapter(
          {
            kind: "claude-code",
            title: "Claude Code",
            executable: "/usr/bin/claude",
          },
          session,
        ),
      ],
    ]),
    probe: async (): Promise<ICodeHudAgentAdapter.IProbe[]> => [],
    token: "paired",
    host: "workbench",
  });

  const port: number = 37_521;
  await bridge.open(port);

  const written: string[] = [];
  const command: CodeHudDeskCommand = new CodeHudDeskCommand({
    address: `ws://127.0.0.1:${port}`,
    token: "paired",
    kind: "claude-code",
    directories: ["/repo"],
    policy: CodeHudDeskCommand.POLICY,
    geometry: { columns: 40, rows: 3, colored: false },
    write: (line: string) => written.push(line),
  });

  // Run in the background, as a terminal would. The promise is held rather than
  // awaited: what this case is about is whether it stays unsettled.
  let ended: unknown = null;
  const running: Promise<void> = command
    .run()
    .then(() => {
      ended = "resolved";
    })
    .catch((thrown: unknown) => {
      ended = thrown;
    });

  try {
    for (let i: number = 0; i < 40 && written.length === 0; ++i)
      await Harness.settle(10);
    TestValidator.predicate("the host connected and drew", written.length > 0);

    // The rude part.
    await bridge.close();
    await Harness.settle(20);
    const before: number = written.length;

    command.speak("hello there");
    await Harness.settle(40);

    TestValidator.equals(
      "the run did not end when the instruction could not be delivered",
      ended,
      null,
    );
    TestValidator.predicate(
      "and the wearer was told something about it",
      written.length > before,
    );

    command.speak("what is it doing");
    await Harness.settle(40);
    TestValidator.predicate(
      "the host is still reading, which is the whole point",
      written.length > before + 1 && ended === null,
    );
  } finally {
    command.stop();
    await Promise.race([running, Harness.settle(40)]);
    await bridge.close().catch(() => undefined);
  }
}
