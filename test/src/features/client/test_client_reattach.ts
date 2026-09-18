import { CodeHudBridgeServer } from "@codehud/bridge";
import { CodeHudSessionClient } from "@codehud/client";
import type {
  ICodeHudAgentAdapter,
  ICodeHudBridgeProvider,
  ICodeHudClientProvider,
  ICodeHudGlassesDescriptor,
  ICodeHudState,
} from "@codehud/interface";
import { CodeHudContext } from "@codehud/projection";
import { WebSocketConnector } from "tgrid";

import { Assert } from "../internal/assert";
import { Harness } from "../internal/harness";

/**
 * A device loses its connection, comes back, and has missed nothing.
 *
 * This is the promise the whole counter exists for. A wearer walks out of
 * range; the session belongs to the bridge and keeps running; the observations
 * keep accumulating; and when the device returns it asks for everything after
 * what it holds and folds to the state it would have reached had it never left.
 *
 * Every piece of that was covered — the registry's replay, the reducer's
 * monotonic guard, the client's counter — and no single run had crossed a real
 * socket, gone, and come back. A guard that is correct against a stand-in and a
 * replay that is correct against a stand-in can still disagree about which
 * counter the reattach names, and the difference is one observation folded
 * twice or one skipped forever.
 *
 * Kept as one case, because the cost here is the socket and paying it twice to
 * assert twice would be twice the cost for no more evidence.
 *
 * Scenarios:
 *
 * 1. A device connects, opens a session, and folds what the harness says.
 * 2. The connection goes while the session keeps running, and the harness keeps
 *    producing — including an approval, which is the thing that must not be
 *    lost, since it blocks.
 * 3. The device reconnects, is welcomed, and is told the session is still
 *    there: the bridge advertises it, so nothing about the session was tied to
 *    the socket.
 * 4. Reattaching from the counter the fold reached brings everything that
 *    happened while it was away, and the approval is pending on the display.
 * 5. Nothing is folded twice: the sequence the fold reached is the one the
 *    harness last produced, not a higher one, and the history holds one entry
 *    per tool call rather than two.
 * 6. The answer given after the reattach reaches the harness, quoting the
 *    identifier it was asked under before the connection dropped.
 */
export async function test_client_reattach(): Promise<void> {
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

  const port: number = 37_519;
  await bridge.open(port);

  // One client across both connections, which is the point: the folds and the
  // counters are what a reconnection has to preserve.
  let client: CodeHudSessionClient | null = null;
  let current: WebSocketConnector<
    null,
    ICodeHudClientProvider,
    ICodeHudBridgeProvider
  > | null = null;
  const connected = (): WebSocketConnector<
    null,
    ICodeHudClientProvider,
    ICodeHudBridgeProvider
  > => {
    if (current === null) throw new Error("the socket is gone");
    return current;
  };
  const dial = async (): Promise<void> => {
    const connector = new WebSocketConnector<
      null,
      ICodeHudClientProvider,
      ICodeHudBridgeProvider
    >(null, {
      event: (event) => (client as CodeHudSessionClient).event(event),
      liveness: async (): Promise<ICodeHudClientProvider.ILiveness> => ({
        held: true,
      }),
    });
    await connector.connect(`ws://127.0.0.1:${port}`);
    current = connector;
  };

  try {
    await dial();
    client = new CodeHudSessionClient({
      bridge: {
        hello: (props) => connected().getDriver().hello(props),
        probe: () => connected().getDriver().probe(),
        open: (props) => connected().getDriver().open(props),
        attach: (id, from) => connected().getDriver().attach(id, from),
        send: (id, command) => connected().getDriver().send(id, command),
        close: (id) => connected().getDriver().close(id),
      },
      token: "paired",
      descriptor,
      context: CodeHudContext.DEFAULT,
    });

    await client.connect();
    const id: string = await client.open({
      kind: "claude-code",
      directory: "/repo",
      policy: { actions: { write: "confirmed" } },
    });

    session.emit("reading the suite");
    await Harness.settle(40);
    const held: number = client.counter(id);
    Assert.predicate(
      "the device folded what it was told",
      held > 0 && client.state(id).message.includes("suite"),
    );

    // Away. The session is the bridge's, so it keeps running and keeps
    // accumulating — including the one observation that blocks.
    await connected().close();
    current = null;

    session.emit(" and the fixtures");
    session.ask("r1", "Write src/index.ts", "Creates a new file.");
    await Harness.settle(40);
    Assert.equals(
      "and the device, being away, folded none of it",
      client.counter(id),
      held,
    );

    // Back.
    await dial();
    const welcome = await client.connect();
    Assert.equals(
      "the bridge still has the session",
      welcome.sessions.map((entry) => entry.id),
      [id],
    );
    await Harness.settle(40);

    const state: ICodeHudState = client.state(id);
    Assert.predicate(
      "what happened while it was away arrived",
      state.message.includes("fixtures"),
    );
    Assert.equals(
      "including the approval, which had been blocking the whole time",
      state.pending?.request,
      "r1",
    );
    Assert.equals(
      "and the frame a wearer would see demands an answer",
      client.frame(id).urgency,
      "demand",
    );

    // Nothing twice: the fold's counter is the harness's last, and the prose
    // that was folded before the drop was not folded onto itself again.
    Assert.equals(
      "the fold is exactly as far along as the harness",
      state.sequence,
      client.counter(id) - 1,
    );
    Assert.equals(
      "and the prose folded once rather than twice",
      state.message,
      "reading the suite and the fixtures",
    );

    await client.send(id, { type: "decision", request: "r1", option: "yes" });
    Assert.equals(
      "an answer given after coming back reaches the harness",
      session.received,
      [{ type: "decision", request: "r1", option: "yes" }],
    );
  } finally {
    if (current !== null) await connected().close();
    await bridge.close();
  }
}
