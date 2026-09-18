import {
  CodeHudBridgeConnection,
  CodeHudSessionRegistry,
  type ICodeHudSessionSubscriber,
} from "@codehud/bridge";
import { CodeHudSessionClient } from "@codehud/client";
import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentEvent,
  ICodeHudFrame,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";
import { CodeHudContext } from "@codehud/projection";
import { CodeHudDeskCommand } from "@codehud/simulator";

import { Assert } from "../internal/assert";
import { Harness } from "../internal/harness";

/**
 * A bridge that has stopped answering is shown, not only mentioned.
 *
 * The host machine goes to sleep and the bridge goes with it. The device
 * reconnects a bounded number of times — a host retrying a dead machine forever
 * is a display that lies about being connected — and then says so.
 *
 * It said so in the wrong place. Driven by taking a real bridge away and waiting
 * the attempts out, what a wearer was left with:
 *
 * ```text
 * ┌────────────────────────────────────────┐
 * │halfway through the refactor            │
 * │                                        │
 * ├────────────────────────────────────────┤
 * │Say stop                                │
 * └────────────────────────────────────────┘
 *  ambient · stream
 * Connection lost, reaching for the bridge
 * ```
 *
 * The frame — the only thing that exists on glasses — shows the agent's last
 * words at an ambient grade and offers an instruction the wearer can no longer
 * give. The single line saying otherwise sits *below the box*, which is this
 * terminal's affordance and is not part of the display.
 *
 * That is #118 one layer out. There a harness that died left the fold reading
 * `working`; here a transport that died leaves it reading the last thing that
 * happened, which is worse, because nothing will arrive again at all.
 *
 * `ICodeHudAgentEvent.IError` already names what this is — "The harness, the
 * **transport**, or the adapter failed" — so the device folds that observation
 * rather than growing a special case. One synthesized event reaches the whole
 * display path: the reducer moves to a fault, the composer grades it a demand,
 * and the notifier routes it like anything a wearer must see.
 *
 * Scenarios:
 *
 * 1. A device holding folds is told the transport is gone, and every session it
 *    holds becomes a fault carrying the message rather than staying on whatever
 *    it last showed.
 * 2. The frame for such a session is a demand, not an ambient stream, and it
 *    carries the reason.
 * 3. A session that has taken observations keeps its fault after them: the
 *    replay guard discards an observation at or below the counter already
 *    folded, and this one has no counter of its own, so being stamped past what
 *    the fold has taken is what makes it arrive at all.
 * 4. A device holding nothing is not harmed by being told.
 */
export async function test_device_host_asleep(): Promise<void> {
  const descriptor: ICodeHudGlassesDescriptor = {
    vendor: "Rokid",
    model: "Glasses",
    geometry: { columns: 40, rows: 3, colored: false },
    capability: {
      microphone: true,
      speaker: false,
      camera: false,
      touchpad: false,
      motion: false,
    },
  };

  const session: Harness.Session = new Harness.Session("s1");
  const registry: CodeHudSessionRegistry = new CodeHudSessionRegistry();
  let held: CodeHudSessionClient | null = null;
  const subscriber: ICodeHudSessionSubscriber = {
    deliver: (event: ICodeHudAgentEvent): Promise<void> =>
      held === null ? Promise.resolve() : held.event(event),
  };
  const connection: CodeHudBridgeConnection = new CodeHudBridgeConnection({
    version: 1,
    host: "workbench",
    accepts: (token: unknown): boolean => token === "paired",
    registry,
    subscriber,
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
  });

  const client: CodeHudSessionClient = new CodeHudSessionClient({
    bridge: connection,
    token: "paired",
    descriptor,
    context: CodeHudContext.DEFAULT,
  });
  held = client;

  // 4. Nothing held, nothing to spoil.
  client.lost("The bridge is not answering");
  Assert.equals(
    "a device holding nothing is unharmed by being told",
    client.state("never-opened").activity,
    "connecting",
  );

  await client.connect();
  const id: string = await client.open({
    kind: "claude-code",
    directory: "/repo",
    policy: CodeHudDeskCommand.POLICY,
  });
  session.emit("halfway through the refactor");
  await Harness.settle();
  Assert.equals(
    "while the host is awake the session is working",
    client.state(id).activity,
    "working",
  );

  // 1-3. The machine goes to sleep.
  client.lost("The bridge is not answering");
  Assert.equals(
    "and once the device has given up, the session is a fault",
    client.state(id).activity,
    "fault",
  );
  Assert.equals(
    "carrying the reason rather than the last thing that happened",
    client.state(id).fault,
    "The bridge is not answering",
  );

  const frame: ICodeHudFrame = client.frame(id);
  Assert.equals(
    "the frame demands rather than drifting past at an ambient grade",
    frame.urgency,
    "demand",
  );
  Assert.predicate(
    "and the wearer's own surface says what happened",
    frame.lines.some((line) => line.text.includes("not answering")),
  );

  await registry.shutdown();
}
