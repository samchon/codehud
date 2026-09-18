import {
  CodeHudBridgeConnection,
  CodeHudSessionRegistry,
} from "@codehud/bridge";
import { CodeHudSessionClient } from "@codehud/client";
import type {
  ICodeHudAgentAdapter,
  ICodeHudBridgeProvider,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";
import { CodeHudContext } from "@codehud/projection";
import { CodeHudDeskAction } from "@codehud/simulator";

import { Assert } from "../internal/assert";
import { Harness } from "../internal/harness";

/**
 * The second confirmation survives a handoff, because the policy travels.
 *
 * Four of the eight action classes default to being asked about twice, and the
 * second confirmation is this product's rather than either harness's: neither
 * binary can express it, so it happens on the device, before the answer is
 * sent. That is stated, it is implemented, and it was reachable only by the
 * surface that opened the session.
 *
 * `policy` appeared in exactly two places: translated into launch flags when a
 * session is opened, and read by the device when it decides. The bridge never
 * held it, the advertisement never carried it, and the client never learned it.
 * The desk host looked right only because it drives sessions it opened itself
 * and passes one frozen constant to both ends.
 *
 * The contract has supported joining a session another surface started since
 * handoff was built for it. A device that joined had nothing to learn the
 * policy from, so it either invented a stricter one than the one in force or
 * asked once about a deletion. Neither is the promise, and nothing in the
 * system would have said so.
 *
 * Scenarios:
 *
 * 1. A session is advertised with the policy it was opened under, not with a
 *    default and not with nothing.
 * 2. A client that opened the session knows that policy, and a client that only
 *    connected afterwards knows the same one.
 * 3. Two sessions opened under different policies are advertised separately —
 *    the policy belongs to the session, not to the bridge.
 * 4. Given the policy it was handed, the joining device asks twice about a
 *    deletion and once about a write. This is the behaviour the advertisement
 *    exists to make possible, checked through the same routing table the desk
 *    host uses rather than through a paraphrase of it.
 * 5. An identifier this client has neither opened nor been told about is not
 *    known, which a caller must read as "ask, do not assume" rather than as
 *    "no policy".
 */
export async function test_bridge_session_policy(): Promise<void> {
  const registry: CodeHudSessionRegistry = new CodeHudSessionRegistry();
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

  const opened: Harness.Session = new Harness.Session("s1");
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
      >([
        [
          "claude-code",
          new Harness.Adapter(
            {
              kind: "claude-code",
              title: "Claude Code",
              executable: "/usr/bin/claude",
            },
            opened,
          ),
        ],
      ]),
      probe: async (): Promise<ICodeHudAgentAdapter.IProbe[]> => [],
    });

  // What the wearer at the first surface said about this session, and it is
  // not the default: writes are ordinary here and deletions are not.
  const stated: ICodeHudAgentAdapter.IPolicy = {
    actions: {
      read: "unattended",
      write: "attended",
      execute: "attended",
      network: "attended",
      delete: "confirmed",
      history: "attended",
      publish: "attended",
      credential: "attended",
    },
  };

  const first: Harness.Device = new Harness.Device();
  const starting: CodeHudBridgeConnection = connection(first);
  await starting.hello({ version: 1, token: "any", descriptor });
  const opener: CodeHudSessionClient = new CodeHudSessionClient({
    bridge: starting,
    token: "any",
    descriptor,
    context: CodeHudContext.DEFAULT,
  });
  const id: string = await opener.open({
    kind: "claude-code",
    directory: "/repo",
    policy: stated,
  });

  // 1. The advertisement.
  Assert.equals(
    "the session is advertised with the policy it was opened under",
    registry.list().map((entry) => entry.policy),
    [stated],
  );

  // 2. Both surfaces know it: the one that opened it and the one that joined.
  Assert.equals(
    "the surface that opened it knows the policy it stated",
    opener.session(id)?.policy,
    stated,
  );

  const second: Harness.Device = new Harness.Device();
  const joining: CodeHudBridgeConnection = connection(second);
  const latecomer: CodeHudSessionClient = new CodeHudSessionClient({
    bridge: joining,
    token: "any",
    descriptor,
    context: CodeHudContext.DEFAULT,
  });
  const welcome: ICodeHudBridgeProvider.IWelcome = await latecomer.connect();
  Assert.equals(
    "and so does the surface that only joined",
    latecomer.session(id)?.policy,
    stated,
  );
  Assert.equals(
    "which is the same thing the welcome told it",
    welcome.sessions.map((entry) => entry.policy),
    [stated],
  );

  // 3. The policy belongs to the session rather than to the bridge.
  const other: Harness.Session = new Harness.Session("s2");
  registry.adopt(other, {
    kind: "codex",
    directory: "/elsewhere",
    policy: Harness.POLICY,
  });
  Assert.equals(
    "two sessions under two policies are advertised as two",
    registry
      .list()
      .map((entry) => [entry.id, entry.policy.actions["history"]] as const),
    [
      [id, "attended"],
      ["s2", "confirmed"],
    ],
  );

  // 4. What the advertisement is for. Driven through the same table the desk
  // host uses, with the policy the joining device was handed rather than one
  // it chose for itself.
  const learned: ICodeHudAgentAdapter.IPolicy =
    latecomer.session(id)?.policy ?? Harness.POLICY;
  const pending = (
    action: ICodeHudAgentAdapter.IPolicy.Action,
  ): Parameters<typeof CodeHudDeskAction.decide>[1] => ({
    ...latecomer.state(id),
    // `confirming` belongs to the fold rather than to the request: the request
    // is still pending, still blocking and still refusable while it is set.
    confirming: false,
    pending: {
      type: "permission",
      session: id,
      sequence: 0,
      at: 0,
      request: "r1",
      title: "the request in front of the wearer",
      action,
      options: [
        { id: "yes", label: "Allow", affirmative: true, persistent: false },
        { id: "no", label: "Deny", affirmative: false, persistent: false },
      ],
    },
  });
  Assert.equals(
    "the joining device asks twice about a deletion, because the session says so",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      pending("delete"),
      learned,
    ),
    { type: "confirm", request: "r1", confirming: true },
  );
  Assert.equals(
    "and once about a write, because this session says that too",
    CodeHudDeskAction.decide(
      { type: "command", command: "allow" },
      pending("write"),
      learned,
    ),
    { type: "decision", request: "r1", option: "yes" },
  );

  // 5. Not knowing is not the same as knowing there is nothing.
  Assert.equals(
    "a session this device has never heard of is not known",
    latecomer.session("never-opened-here"),
    undefined,
  );
}
