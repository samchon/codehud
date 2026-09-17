import {
  CodeHudBridgeConnection,
  CodeHudSessionRegistry,
  type ICodeHudSessionSubscriber,
} from "@codehud/bridge";
import { CodeHudSessionClient } from "@codehud/client";
import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentEvent,
  ICodeHudBridgeProvider,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";
import { CodeHudContext } from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

import { Harness } from "../internal/harness";

/**
 * A device opens a session, is asked, answers, and the answer arrives.
 *
 * Every other case in this suite checks one layer. This one runs the whole
 * path: a client asks a bridge to open a session, an adapter produces an
 * approval, the bridge fans it out, the client folds it into a frame a wearer
 * could read, the wearer answers, and the answer reaches the harness.
 *
 * The harness is a stand-in and the transport is a direct handover rather than
 * a socket, so this is not the end-to-end run the repository still owes. It is
 * every seam between those two ends, crossed once, in order. A layer can be
 * individually correct and the chain still wrong, and until now nothing here
 * had ever crossed more than two of them at a time.
 *
 * Scenarios:
 *
 * 1. Opening a session through the client returns an identifier and subscribes
 *    the device without a separate attach.
 * 2. An observation the harness produces reaches the device's fold, and the
 *    frame it composes is one a wearer could act on.
 * 3. An approval reaches the device as a demand-grade frame naming the tool,
 *    with a hint saying what to say.
 * 4. The wearer's answer reaches the harness, quoting the identifier it was
 *    asked under.
 * 5. The approval clears from the display as soon as the answer is delivered,
 *    rather than when its consequence arrives.
 * 6. An answer that fails to reach the bridge leaves the approval in front of
 *    the wearer, because they still have to answer it.
 * 7. A device that drops and returns attaches from the counter it held, is
 *    re-sent what it missed, and reaches the same fold as one that never left.
 * 8. The counter it names is exactly the lowest it still needs, and a duplicate
 *    never moves it. Both are asserted directly on the number, because the fold
 *    cannot see either mistake: re-sending what is already held is idempotent
 *    by design, so an off-by-one and a counter that walks backwards both
 *    produce the right display and the wrong amount of traffic.
 */
export async function test_client_vertical(): Promise<void> {
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

  // Every counter the device ever asked to attach from, so the number itself
  // can be checked rather than only its consequence.
  const asked: number[] = [];

  const registry: CodeHudSessionRegistry = new CodeHudSessionRegistry();
  const session: Harness.Session = new Harness.Session("s1");
  const adapter: Harness.Adapter = new Harness.Adapter(
    {
      kind: "claude-code",
      title: "Claude Code",
      executable: "/usr/bin/claude",
    },
    session,
  );

  // The client is built first so the bridge can deliver to it: the two halves
  // of a duplex surface, handed to each other instead of to a socket.
  let client: CodeHudSessionClient | null = null;
  const subscriber: ICodeHudSessionSubscriber = {
    deliver: (event: ICodeHudAgentEvent): Promise<void> =>
      client === null ? Promise.resolve() : client.event(event),
  };
  const spied: CodeHudBridgeConnection = new CodeHudBridgeConnection({
    version: 1,
    host: "workbench",
    accepts: (token: unknown): boolean => token === "paired",
    registry,
    subscriber,
    adapters: new Map<
      ICodeHudAgentAdapter.IProbe["kind"],
      ICodeHudAgentAdapter
    >([["claude-code", adapter]]),
    probe: async (): Promise<ICodeHudAgentAdapter.IProbe[]> => [],
  });
  const connection: ICodeHudBridgeProvider = {
    hello: (props) => spied.hello(props),
    probe: () => spied.probe(),
    open: (props) => spied.open(props),
    attach: (session, from) => {
      asked.push(from);
      return spied.attach(session, from);
    },
    send: (session, command) => spied.send(session, command),
    close: (session) => spied.close(session),
  };
  client = new CodeHudSessionClient({
    bridge: connection,
    token: "paired",
    descriptor,
    context: CodeHudContext.DEFAULT,
  });

  const welcome = await client.connect();
  TestValidator.equals(
    "the bridge accepted the device",
    welcome.host,
    "workbench",
  );
  TestValidator.equals("with nothing running yet", welcome.sessions.length, 0);

  const id: string = await client.open({
    kind: "claude-code",
    directory: "/repo",
    policy: { actions: { write: "confirmed" } },
  });
  TestValidator.equals("the session is open", id, "s1");

  session.emit("looking at the tests");
  await Harness.settle();
  TestValidator.predicate(
    "what the agent said reached the device",
    client.frame(id).lines.some((line) => line.text.includes("tests")),
  );

  session.ask("r1", "Write src/index.ts", "Creates a new file.");
  await Harness.settle();

  const asking = client.frame(id);
  TestValidator.equals(
    "an approval demands the wearer",
    asking.kind,
    "permission",
  );
  TestValidator.equals("and says so", asking.urgency, "demand");
  TestValidator.predicate(
    "naming what is being asked",
    asking.lines[0]!.text.startsWith("Write"),
  );
  TestValidator.predicate(
    "with something to say out loud",
    asking.hint?.includes("Allow") === true,
  );

  await client.send(id, { type: "decision", request: "r1", option: "yes" });
  TestValidator.equals("the answer reached the harness", session.received, [
    { type: "decision", request: "r1", option: "yes" },
  ]);
  TestValidator.equals(
    "and the question left the display as soon as it was delivered",
    client.state(id).pending,
    undefined,
  );
  TestValidator.equals(
    "leaving a session that is working rather than one that looks idle",
    client.state(id).activity,
    "working",
  );
  TestValidator.equals(
    "so the display goes back to the prose still in flight, not to idle",
    client.frame(id).kind,
    "stream",
  );

  // A delivery that fails leaves the wearer with the question they still owe.
  session.ask("r2", "Delete build/", "Removes generated output.");
  await Harness.settle();
  TestValidator.predicate(
    "a second approval is pending",
    client.state(id).pending?.request === "r2",
  );
  session.refuseNext = true;
  await client
    .send(id, { type: "decision", request: "r2", option: "yes" })
    .catch(() => undefined);
  TestValidator.equals(
    "an undelivered answer leaves the approval in front of the wearer",
    client.state(id).pending?.request,
    "r2",
  );
  session.refuseNext = false;
  await client.send(id, { type: "decision", request: "r2", option: "yes" });

  // The device drops, misses observations, and comes back.
  const held: number = client.counter(id);
  registry.detach(subscriber);
  session.emit("still working while nobody watched");
  session.emit("and again");
  await Harness.settle();
  TestValidator.equals(
    "a detached device folds nothing",
    client.counter(id),
    held,
  );

  await client.attach(id);
  await Harness.settle();
  TestValidator.predicate(
    "returning catches up on what it missed",
    client.counter(id) > held,
  );
  TestValidator.predicate(
    "and the display holds what was said while it was away",
    client.frame(id).lines.some((line) => line.text.includes("again")) ||
      client.state(id).history.some((entry) => entry.title.includes("again")),
  );

  TestValidator.equals(
    "every attach named exactly the counter the device still needed",
    asked[asked.length - 1],
    held,
  );

  // A duplicate must not walk the counter backwards. Nothing downstream would
  // notice if it did, which is why it is asserted on the number.
  const reached: number = client.counter(id);
  await client.event({
    type: "message",
    session: id,
    sequence: 0,
    at: 0,
    delta: "already folded",
    complete: true,
  });
  TestValidator.equals(
    "a duplicate leaves the counter where it was",
    client.counter(id),
    reached,
  );

  // Attaching again from the same counter re-sends what is already held.
  const settled = client.state(id);
  await client.attach(id);
  await Harness.settle();
  TestValidator.equals(
    "and folding it twice changes nothing",
    client.state(id),
    settled,
  );
}
