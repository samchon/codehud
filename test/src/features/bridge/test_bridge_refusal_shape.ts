import { CodeHudBridgeFailure, CodeHudSessionRegistry } from "@codehud/bridge";

import { Assert } from "../internal/assert";
import { Harness } from "../internal/harness";

/**
 * Every refusal is one shape, short enough to carry, and recognizable on
 * arrival.
 *
 * The protocol admits four causes and no fifth, because a refusal with nowhere
 * to appear on the display is a wearer stuck with nothing to read. The shape
 * also has to survive the connection: measured against tgrid 1.2.1 with a real
 * server and client, a rejection arrives as a plain object, never as the class
 * it left as, so the client half cannot use `instanceof` and checks the contract
 * fields instead.
 *
 * The length bound is not about fitting a display. The composer fits text to the
 * geometry it has, and the bridge does not know the geometry when it refuses a
 * handshake. It bounds what crosses the wire and enters a fold, so a harness
 * that failed to launch and printed a page of diagnostics contributes a sentence
 * rather than the page.
 *
 * Scenarios:
 *
 * 1. A short message is carried unchanged, with its cause.
 * 2. A long message is shortened to within the limit, never to one character
 *    beyond it, and says it was shortened.
 * 3. A message exactly at the limit is left alone, the boundary between the two.
 * 4. Whitespace a harness wrapped its diagnostics with is collapsed, since
 *    newlines on a two-line display are rows nobody chose to spend.
 * 5. An unknown session refuses with the session cause and names what was asked
 *    for, so the refusal is something a wearer can act on later.
 * 6. Recognition accepts each of the four causes and rejects everything else,
 *    including an Error rendered the way the transport renders one. That last
 *    case is the negative twin: it is exactly what arrives when something other
 *    than a refusal goes wrong, and treating it as a refusal would put a stack
 *    trace on the glasses.
 */
export async function test_bridge_refusal_shape(): Promise<void> {
  const short = CodeHudBridgeFailure.create("token", "the code does not match");
  Assert.equals("cause is carried", short.cause, "token");
  Assert.equals(
    "a short message is unchanged",
    short.message,
    "the code does not match",
  );

  const long = CodeHudBridgeFailure.create("launch", "x".repeat(5_000));
  Assert.equals(
    "a long message is bounded",
    long.message.length,
    CodeHudBridgeFailure.LIMIT,
  );
  Assert.predicate("and says it was shortened", long.message.endsWith("…"));

  const exact = CodeHudBridgeFailure.create(
    "launch",
    "y".repeat(CodeHudBridgeFailure.LIMIT),
  );
  Assert.equals(
    "a message at the limit is left alone",
    exact.message,
    "y".repeat(CodeHudBridgeFailure.LIMIT),
  );

  const wrapped = CodeHudBridgeFailure.create(
    "launch",
    "  claude exited\n\n  code 127  ",
  );
  Assert.equals(
    "wrapping is collapsed",
    wrapped.message,
    "claude exited code 127",
  );

  const registry: CodeHudSessionRegistry = new CodeHudSessionRegistry();
  registry.adopt(new Harness.Session("s1"), {
    kind: "claude-code",
    directory: "/repo",
    policy: Harness.POLICY,
  });
  // Captured rather than asserted through Assert.throws, which reports
  // that something was thrown but does not hand back what. The refusal's own
  // contents are the point here.
  const refused: unknown = ((): unknown => {
    try {
      registry.attach("nope", 0, new Harness.Device());
      return undefined;
    } catch (thrown: unknown) {
      return thrown;
    }
  })();

  Assert.predicate("an unknown session refuses", refused !== undefined);
  Assert.predicate("and it is a refusal", CodeHudBridgeFailure.is(refused));
  if (CodeHudBridgeFailure.is(refused) === true) {
    Assert.equals("with the session cause", refused.cause, "session");
    Assert.predicate(
      "naming what was asked for",
      refused.message.includes("nope"),
    );
  }

  for (const cause of ["token", "version", "session", "launch"] as const)
    Assert.predicate(
      `${cause} is recognized`,
      CodeHudBridgeFailure.is({ cause, message: "any" }),
    );

  Assert.equals(
    "an Error as the transport renders one is not a refusal",
    CodeHudBridgeFailure.is({
      name: "Error",
      message: "boom",
      stack: "Error: boom\n    at somewhere",
    }),
    false,
  );
  Assert.equals(
    "nor is an unknown cause",
    CodeHudBridgeFailure.is({ cause: "timeout", message: "boom" }),
    false,
  );
  Assert.equals(
    "nor a refusal missing its message",
    CodeHudBridgeFailure.is({ cause: "token" }),
    false,
  );
  Assert.equals("nor nothing at all", CodeHudBridgeFailure.is(null), false);
}
