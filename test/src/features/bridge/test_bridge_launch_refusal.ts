import {
  CodeHudBridgeConnection,
  CodeHudBridgeFailure,
  CodeHudSessionRegistry,
} from "@codehud/bridge";
import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentDescriptor,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";

import { Assert } from "../internal/assert";
import { Harness } from "../internal/harness";

/**
 * A harness that will not start says so, and opening one subscribes the opener.
 *
 * The wearer is not at the machine. When nothing happens after they asked for a
 * session, the only thing that can tell them why is the refusal that comes back,
 * so whatever the adapter said has to survive the trip rather than being
 * flattened into a generic failure.
 *
 * Opening also subscribes the caller, rather than leaving it to a separate
 * attach. The harness can speak before the open call has even returned, and a
 * device that had to ask for what it missed afterwards would be racing its own
 * request for the first observations of every session it starts.
 *
 * Scenarios:
 *
 * 1. A family the bridge has no adapter for is refused as a launch failure,
 *    because from the wearer's side nothing started and the distinction between
 *    "absent" and "broken" is not one they can act on differently.
 * 2. An adapter that throws an `Error` contributes its message.
 * 3. An adapter that throws something that is not an `Error` still yields a
 *    readable sentence rather than a coerced object, the arm that keeps
 *    `[object Object]` off the glasses.
 * 4. A refused open leaves no session behind, so a wearer retrying is not
 *    accumulating dead entries in the list.
 * 5. A successful open returns the session identifier and registers it with the
 *    working directory and family the wearer chose.
 * 6. The opener receives observations produced after the open without attaching,
 *    including the first one.
 * 7. The properties the wearer chose reach the adapter unchanged, since the
 *    resume identifier and the policy are the difference between continuing work
 *    and starting over.
 */
export async function test_bridge_launch_refusal(): Promise<void> {
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
  const harness: ICodeHudAgentDescriptor = {
    kind: "claude-code",
    title: "Claude Code",
    executable: "/usr/bin/claude",
  };

  const build = async (
    answer: Harness.Session | (() => never),
  ): Promise<{
    connection: CodeHudBridgeConnection;
    registry: CodeHudSessionRegistry;
    adapter: Harness.Adapter;
    device: Harness.Device;
  }> => {
    const registry: CodeHudSessionRegistry = new CodeHudSessionRegistry();
    const adapter: Harness.Adapter = new Harness.Adapter(harness, answer);
    const device: Harness.Device = new Harness.Device();
    const connection: CodeHudBridgeConnection = new CodeHudBridgeConnection({
      version: 1,
      host: "workbench",
      accepts: (): boolean => true,
      registry,
      subscriber: device,
      adapters: new Map<ICodeHudAgentDescriptor.Kind, ICodeHudAgentAdapter>([
        ["claude-code", adapter],
      ]),
      probe: async (): Promise<ICodeHudAgentAdapter.IProbe[]> => [],
    });
    await connection.hello({ version: 1, token: "any", descriptor });
    return { connection, registry, adapter, device };
  };

  const policy = { actions: { write: "confirmed" } } as const;

  const missing = await build(new Harness.Session("unused"));
  const absent: unknown = await Harness.refusal(() =>
    missing.connection.open({
      kind: "codex",
      directory: "/repo",
      policy,
    }),
  );
  Assert.predicate(
    "an unadapted family refuses",
    CodeHudBridgeFailure.is(absent),
  );
  if (CodeHudBridgeFailure.is(absent) === true) {
    Assert.equals("as a launch failure", absent.cause, "launch");
    Assert.predicate("naming the family", absent.message.includes("codex"));
  }

  const thrown = await build((): never => {
    throw new Error("claude exited with code 127");
  });
  const reported: unknown = await Harness.refusal(() =>
    thrown.connection.open({ kind: "claude-code", directory: "/repo", policy }),
  );
  if (CodeHudBridgeFailure.is(reported) === true) {
    Assert.equals(
      "a thrown Error is a launch failure",
      reported.cause,
      "launch",
    );
    Assert.equals(
      "carrying what the adapter said",
      reported.message,
      "claude exited with code 127",
    );
  }
  Assert.equals(
    "a refused open leaves no session behind",
    thrown.registry.list().length,
    0,
  );

  const odd = await build((): never => {
    throw { code: "ENOENT" };
  });
  const stated: unknown = await Harness.refusal(() =>
    odd.connection.open({ kind: "claude-code", directory: "/repo", policy }),
  );
  if (CodeHudBridgeFailure.is(stated) === true) {
    Assert.predicate(
      "a non-Error still yields a readable sentence",
      stated.message.length > 0,
    );
    Assert.equals(
      "and never a coerced one",
      stated.message.includes("object"),
      false,
    );
  }

  const session: Harness.Session = new Harness.Session("s9");
  const good = await build(session);
  const id: string = await good.connection.open({
    kind: "claude-code",
    directory: "/repo/codehud",
    policy,
    resume: "native-7",
  });
  Assert.equals("the session identifier comes back", id, "s9");
  Assert.equals(
    // The policy among them: it is the wearer's statement about this session,
    // and a device that joins later has nothing else to learn it from.
    "registered with what the wearer chose",
    good.registry.list(),
    [
      {
        id: "s9",
        kind: "claude-code",
        directory: "/repo/codehud",
        policy,
        sequence: 0,
      },
    ],
  );
  Assert.equals(
    "and the adapter was handed the resume identifier",
    good.adapter.opened[0]!.resume,
    "native-7",
  );

  session.emit("first words");
  session.emit("second words");
  await Harness.settle();
  Assert.equals(
    "the opener receives observations without attaching, from the first",
    good.device.seen,
    [0, 1],
  );
}
