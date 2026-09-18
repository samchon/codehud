import {
  CodeHudClaudeNormalizer,
  CodeHudCodexNormalizer,
} from "@codehud/agent";
import {
  CodeHudBridgeConnection,
  CodeHudSessionRegistry,
} from "@codehud/bridge";
import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentEvent,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";

import { Assert } from "../internal/assert";
import { Claude } from "../internal/claude";
import { Codex } from "../internal/codex";
import { Harness } from "../internal/harness";

/**
 * Work started on the glasses can be picked up at the desk, and the other way.
 *
 * The product promises that neither surface owns a session. That promise rests
 * on one small thing: the identifier the *harness* uses has to reach whoever
 * might want to resume it. Our own identifier is no use at a terminal, which
 * has never heard of this bridge.
 *
 * It had not been reaching anyone. The advertisement declared the field, both
 * adapters knew the value, and nothing connected them — so a session opened
 * from the glasses could not be resumed at a terminal at all. The field existed
 * and was always absent, which is the shape a defect takes when a contract is
 * written before the path that fills it.
 *
 * Scenarios:
 *
 * 1. Both harnesses report their own identifier on the observation that
 *    announces a session, because neither knows it when it is launched.
 * 2. The bridge records it as that observation passes, and advertises it.
 * 3. It survives everything that follows: the advertisement still carries it
 *    after a turn's worth of other observations.
 * 4. A harness that reports none leaves the session advertised without one,
 *    which marks it bridge-only rather than pretending.
 * 5. Two surfaces attached to one session see the same pending approval, and
 *    either may answer it.
 * 6. Exactly one answer takes effect, whichever surface produced it.
 */
export async function test_bridge_handoff(): Promise<void> {
  // Both adapters name the harness's own conversation.
  const claude: CodeHudClaudeNormalizer = new CodeHudClaudeNormalizer(
    "s1",
    () => 0,
  );
  const opened = Claude.sent(Claude.PLAIN)
    .flatMap((line) => claude.normalize(line as CodeHudClaudeNormalizer.ILine))
    .find(
      (event): event is ICodeHudAgentEvent.ISession => event.type === "session",
    );
  Assert.predicate("Claude announced a session", opened !== undefined);
  Assert.equals(
    "naming the conversation in its own terms",
    opened?.native,
    Claude.sent(Claude.PLAIN).find((line) => line.type === "system")
      ?.session_id,
  );

  const codex: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s2",
    () => 0,
  );
  const started = Codex.sent(Codex.PLAIN)
    .flatMap((line) => codex.normalize(line as CodeHudCodexNormalizer.IMessage))
    .find(
      (event): event is ICodeHudAgentEvent.ISession => event.type === "session",
    );
  Assert.predicate("Codex announced a session", started !== undefined);
  Assert.equals(
    "naming its thread",
    started?.native,
    Codex.sent(Codex.PLAIN).find((line) => line.method === "thread/started")
      ?.params?.thread?.id,
  );

  // The bridge records it and advertises it.
  const registry: CodeHudSessionRegistry = new CodeHudSessionRegistry();
  const session: Harness.Session = new Harness.Session("s1");
  registry.adopt(session, {
    kind: "claude-code",
    directory: "/repo",
    policy: Harness.POLICY,
  });
  Assert.equals(
    "a session not yet named by its harness is advertised without one",
    registry.list()[0]?.native,
    undefined,
  );

  session.announce("native-conversation-7");
  await Harness.settle();
  Assert.equals(
    "and carries it once the harness has said",
    registry.list()[0]?.native,
    "native-conversation-7",
  );

  session.emit("working");
  session.emit("still working");
  await Harness.settle();
  Assert.equals(
    "which survives everything that follows",
    registry.list()[0]?.native,
    "native-conversation-7",
  );

  // Two surfaces, one session, one answer.
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
  const glasses: Harness.Device = new Harness.Device();
  const desk: Harness.Device = new Harness.Device();
  const connection = (subscriber: Harness.Device): CodeHudBridgeConnection =>
    new CodeHudBridgeConnection({
      version: 1,
      host: "workbench",
      accepts: (): boolean => true,
      registry,
      subscriber,
      adapters: new Map<
        ICodeHudAgentAdapter.IProbe["kind"],
        ICodeHudAgentAdapter
      >(),
      probe: async (): Promise<ICodeHudAgentAdapter.IProbe[]> => [],
    });

  const fromGlasses: CodeHudBridgeConnection = connection(glasses);
  const fromDesk: CodeHudBridgeConnection = connection(desk);
  await fromGlasses.hello({ version: 1, token: "any", descriptor });
  await fromDesk.hello({ version: 1, token: "any", descriptor });

  const advertised = await fromDesk.hello({
    version: 1,
    token: "any",
    descriptor,
  });
  Assert.equals(
    "the desk discovers the session the glasses started",
    advertised.sessions.map((entry) => entry.native),
    ["native-conversation-7"],
  );

  await fromGlasses.attach("s1", 0);
  await fromDesk.attach("s1", 0);
  session.ask("r1", "Write src/index.ts");
  await Harness.settle();

  Assert.predicate(
    "both surfaces were shown the approval",
    glasses.seen.length > 0 && desk.seen.length === glasses.seen.length,
  );

  await fromDesk.send("s1", {
    type: "decision",
    request: "r1",
    option: "yes",
  });
  Assert.equals(
    "and the answer from either one reaches the harness once",
    session.received,
    [{ type: "decision", request: "r1", option: "yes" }],
  );
}
