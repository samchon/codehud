import {
  CodeHudBridgeConnection,
  CodeHudBridgeFailure,
  CodeHudSessionRegistry,
} from "@codehud/bridge";
import type {
  ICodeHudAgentAdapter,
  ICodeHudBridgeProvider,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";

import { Assert } from "../internal/assert";
import { Harness } from "../internal/harness";

/**
 * Nothing works before a device has been welcomed, and every refusal looks the
 * same.
 *
 * The gate matters because the connection is accepted at the transport level on
 * purpose: a device that presented the wrong pairing code is told why, in a form
 * a display can render, rather than having its socket closed under it with a
 * status number. That decision only pays off if the accepted-but-unwelcomed
 * connection can do nothing else.
 *
 * The revision is checked before the credential, so a device too old to have
 * formed a correct token learns the actual problem instead of being told its
 * code is wrong.
 *
 * Scenarios:
 *
 * 1. A disagreeing revision is refused with the version cause, naming both
 *    revisions so the wearer knows which side to update.
 * 2. A wrong credential is refused with the token cause.
 * 3. Order matters: a device that is both too old and wrong-credentialled hears
 *    about the revision, which is the one that explains the other.
 * 4. Every operation before a successful welcome is refused, and as a credential
 *    refusal rather than a fifth cause the display has no phrasing for.
 * 5. A correct handshake reports the bridge's revision, its host name, and the
 *    sessions already running, which is the normal case after a reconnect rather
 *    than the exception.
 * 6. After welcoming, the operations that were refused succeed. The negative
 *    twin: without it, a connection that refused everything forever would pass
 *    scenario 4.
 * 7. The welcomed device is recorded, since the geometry is what the client
 *    composes against and the bridge cannot ask for it again.
 */
export async function test_bridge_handshake(): Promise<void> {
  const registry: CodeHudSessionRegistry = new CodeHudSessionRegistry();
  registry.adopt(new Harness.Session("already"), {
    kind: "codex",
    directory: "/repo",
    native: "codex-42",
  });

  const descriptor: ICodeHudGlassesDescriptor = {
    vendor: "Rokid",
    model: "Glasses",
    geometry: { columns: 24, rows: 2, colored: false },
    capability: {
      microphone: true,
      speaker: true,
      camera: false,
      touchpad: false,
      motion: false,
    },
  };
  const probes: ICodeHudAgentAdapter.IProbe[] = [
    { kind: "claude-code", reason: "claude was not found on the PATH" },
  ];
  const connection: CodeHudBridgeConnection = new CodeHudBridgeConnection({
    version: 1,
    host: "workbench",
    accepts: (token: unknown): boolean => token === "right",
    registry,
    subscriber: new Harness.Device(),
    adapters: new Map(),
    probe: async (): Promise<ICodeHudAgentAdapter.IProbe[]> => probes,
  });

  const hello = (
    props: Partial<ICodeHudBridgeProvider.IHello>,
  ): Promise<ICodeHudBridgeProvider.IWelcome> =>
    connection.hello({
      version: 1,
      token: "right",
      descriptor,
      ...props,
    });

  const old: unknown = await Harness.refusal(() => hello({ version: 0 }));
  Assert.predicate(
    "a disagreeing revision refuses",
    CodeHudBridgeFailure.is(old),
  );
  if (CodeHudBridgeFailure.is(old) === true) {
    Assert.equals("with the version cause", old.cause, "version");
    Assert.predicate(
      "naming both revisions",
      old.message.includes("1") && old.message.includes("0"),
    );
  }

  const wrong: unknown = await Harness.refusal(() =>
    hello({ token: "guessed" }),
  );
  Assert.predicate(
    "a wrong credential refuses",
    CodeHudBridgeFailure.is(wrong),
  );
  if (CodeHudBridgeFailure.is(wrong) === true)
    Assert.equals("with the token cause", wrong.cause, "token");

  const both: unknown = await Harness.refusal(() =>
    hello({ version: 0, token: "guessed" }),
  );
  if (CodeHudBridgeFailure.is(both) === true)
    Assert.equals(
      "the revision is reported ahead of the credential",
      both.cause,
      "version",
    );

  for (const [name, task] of [
    ["probe", (): Promise<unknown> => connection.probe()],
    ["attach", (): Promise<unknown> => connection.attach("already", 0)],
    [
      "send",
      (): Promise<unknown> => connection.send("already", { type: "interrupt" }),
    ],
    ["close", (): Promise<unknown> => connection.close("already")],
  ] as const) {
    const barred: unknown = await Harness.refusal(task);
    Assert.predicate(
      `${name} is refused before a welcome`,
      CodeHudBridgeFailure.is(barred),
    );
    if (CodeHudBridgeFailure.is(barred) === true)
      Assert.equals(
        `${name} refuses as a credential refusal`,
        barred.cause,
        "token",
      );
  }

  Assert.equals(
    "no device is recorded before a welcome",
    connection.device,
    null,
  );

  const welcome: ICodeHudBridgeProvider.IWelcome = await hello({});
  Assert.equals("the bridge states its revision", welcome.version, 1);
  Assert.equals("and names the machine", welcome.host, "workbench");
  Assert.equals(
    "and advertises what is already running",
    welcome.sessions.map((s) => s.id),
    ["already"],
  );
  Assert.equals(
    "with the identifier a terminal on the host would resume",
    welcome.sessions[0]!.native,
    "codex-42",
  );
  Assert.equals(
    "the welcomed device is recorded",
    connection.device,
    descriptor,
  );

  Assert.equals(
    "probing works once welcomed",
    await connection.probe(),
    probes,
  );
  await connection.attach("already", 0);
  await connection.send("already", { type: "interrupt" });
}
