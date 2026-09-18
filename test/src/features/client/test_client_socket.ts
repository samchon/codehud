import { CodeHudBridgeServer } from "@codehud/bridge";
import { CodeHudSessionClient } from "@codehud/client";
import type {
  ICodeHudAgentAdapter,
  ICodeHudBridgeProvider,
  ICodeHudClientProvider,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";
import { CodeHudContext } from "@codehud/projection";
import { type Driver, WebSocketConnector } from "tgrid";

import { Assert } from "../internal/assert";
import { Harness } from "../internal/harness";

/**
 * One run, from a connected device across a real socket to an answered
 * approval.
 *
 * The repository's README carries a sentence saying this had never happened:
 * every seam on the path was implemented and covered, and no single run had
 * crossed all of them. This is the run. The transport is an actual WebSocket on
 * an actual port, the pairing code is checked, and the wearer's answer travels
 * back over the same connection.
 *
 * Only the harness is a stand-in, because launching a real coding agent inside
 * a test suite would measure the agent rather than this repository. Everything
 * between the device and that stand-in is the production path.
 *
 * Kept as one case rather than several, because its cost is the socket and
 * paying that four times to assert four things would be four times the cost for
 * no more evidence.
 *
 * Scenarios:
 *
 * 1. A device that presents the wrong pairing code is refused, in the one
 *    refusal shape, over the socket rather than by having its connection
 *    dropped.
 * 2. A device that presents the right one is welcomed and told the host's name.
 * 3. Opening a session and the observations that follow cross the socket, and
 *    the device composes a frame from them.
 * 4. An approval reaches the device as a demand-grade frame.
 * 5. The wearer's answer crosses back and reaches the harness, quoting the
 *    identifier it was asked under.
 * 6. Closing the session and the connection leaves nothing running.
 */
export async function test_client_socket(): Promise<void> {
  const descriptor: ICodeHudGlassesDescriptor = {
    vendor: "Test",
    model: "Simulator",
    geometry: { columns: 48, rows: 4, colored: true },
    capability: {
      microphone: true,
      speaker: false,
      camera: false,
      touchpad: false,
      motion: false,
    },
  };

  const session: Harness.Session = new Harness.Session("s1");
  const adapter: Harness.Adapter = new Harness.Adapter(
    {
      kind: "claude-code",
      title: "Claude Code",
      executable: "/usr/bin/claude",
    },
    session,
  );
  const bridge: CodeHudBridgeServer = new CodeHudBridgeServer({
    adapters: new Map<
      ICodeHudAgentAdapter.IProbe["kind"],
      ICodeHudAgentAdapter
    >([["claude-code", adapter]]),
    probe: async (): Promise<ICodeHudAgentAdapter.IProbe[]> => [],
    token: "paired",
    host: "workbench",
  });

  // A high port, and the loopback address rather than a discovered one: the
  // point of this case is the socket, not the network.
  const port: number = 37_517;
  await bridge.open(port);

  const dial = async (
    client: CodeHudSessionClient,
  ): Promise<{
    connector: WebSocketConnector<
      null,
      ICodeHudClientProvider,
      ICodeHudBridgeProvider
    >;
    remote: Driver<ICodeHudBridgeProvider>;
  }> => {
    const connector = new WebSocketConnector<
      null,
      ICodeHudClientProvider,
      ICodeHudBridgeProvider
    >(null, client);
    await connector.connect(`ws://127.0.0.1:${port}`);
    return { connector, remote: connector.getDriver() };
  };

  try {
    // A device with the wrong code, refused over the connection rather than by
    // losing it.
    const wrong: CodeHudSessionClient = new CodeHudSessionClient({
      bridge: {} as ICodeHudBridgeProvider,
      token: "guessed",
      descriptor,
      context: CodeHudContext.DEFAULT,
    });
    const refused = await dial(wrong);
    const rejection: unknown = await refused.remote
      .hello({ version: 1, token: "guessed", descriptor })
      .then((): unknown => undefined)
      .catch((thrown: unknown) => thrown);
    Assert.predicate(
      "a wrong pairing code is refused",
      rejection !== undefined,
    );
    Assert.equals(
      "with the credential cause, in the one refusal shape",
      (rejection as { cause?: string } | undefined)?.cause,
      "token",
    );
    await refused.connector.close();

    // The device that belongs here.
    let client: CodeHudSessionClient | null = null;
    const holder: ICodeHudClientProvider = {
      event: (event) => (client as CodeHudSessionClient).event(event),
      liveness: () => (client as CodeHudSessionClient).liveness(),
    };
    const connector = new WebSocketConnector<
      null,
      ICodeHudClientProvider,
      ICodeHudBridgeProvider
    >(null, holder);
    await connector.connect(`ws://127.0.0.1:${port}`);
    const remote: Driver<ICodeHudBridgeProvider> = connector.getDriver();

    client = new CodeHudSessionClient({
      bridge: remote,
      token: "paired",
      descriptor,
      context: CodeHudContext.DEFAULT,
    });

    const welcome = await client.connect();
    Assert.equals("the bridge welcomed the device", welcome.version, 1);
    Assert.equals("naming the machine", welcome.host, "workbench");

    const id: string = await client.open({
      kind: "claude-code",
      directory: "/repo",
      policy: { actions: { write: "confirmed" } },
    });
    Assert.equals("the session opened over the socket", id, "s1");

    session.emit("reading the suite");
    await Harness.settle(40);
    Assert.predicate(
      "and what the agent said crossed it",
      client.frame(id).lines.some((line) => line.text.includes("suite")),
    );

    session.ask("r1", "Write src/index.ts", "Creates a new file.");
    await Harness.settle(40);
    const asking = client.frame(id);
    Assert.equals("an approval arrived", asking.kind, "permission");
    Assert.equals("demanding an answer", asking.urgency, "demand");

    await client.send(id, { type: "decision", request: "r1", option: "yes" });
    await Harness.settle(40);
    Assert.equals(
      "and the wearer's answer crossed back to the harness",
      session.received,
      [{ type: "decision", request: "r1", option: "yes" }],
    );

    await client.close(id);
    Assert.equals("closing ends the harness", session.closed, 1);
    await connector.close();
  } finally {
    await bridge.close();
  }
}
