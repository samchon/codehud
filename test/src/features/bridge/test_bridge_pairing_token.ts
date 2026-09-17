import { CodeHudPairingToken } from "@codehud/bridge";
import { TestValidator } from "@nestia/e2e";

/**
 * The one credential admits exactly what the bridge issued, and nothing near it.
 *
 * What the token defends against is another device on a network the user already
 * operates connecting by accident. That is a narrow claim, and it is the one the
 * specification makes; a hostile party with access to the network is explicitly
 * out of scope here.
 *
 * Narrow does not mean loose. A comparison that accepted a prefix, a different
 * casing, or a non-string would fail at exactly the job it does have, which is
 * telling two devices apart.
 *
 * Scenarios:
 *
 * 1. An issued token matches itself.
 * 2. Two issues differ, so the credential identifies a process rather than the
 *    product.
 * 3. A prefix is refused. The comparison rejects unequal lengths before reaching
 *    the constant-time check, which throws on them, so this is the arm that
 *    proves the guard is in front rather than missing.
 * 4. A same-length near miss is refused, which is what the constant-time check
 *    itself decides.
 * 5. A non-string is refused rather than coerced, since whatever arrives over a
 *    connection is unvalidated and `String(value)` would admit an object whose
 *    `toString` happened to agree.
 * 6. The pairing payload carries the address as well as the credential, because
 *    a device needs both and a wearer scanning a code can supply neither.
 * 7. A token containing characters a query string would otherwise eat is encoded
 *    in the payload and survives being read back.
 */
export async function test_bridge_pairing_token(): Promise<void> {
  const issued: string = CodeHudPairingToken.issue();
  TestValidator.predicate(
    "an issued token matches itself",
    CodeHudPairingToken.matches(issued, issued),
  );
  TestValidator.equals(
    "two issues differ",
    CodeHudPairingToken.matches(issued, CodeHudPairingToken.issue()),
    false,
  );

  TestValidator.equals(
    "a prefix is refused",
    CodeHudPairingToken.matches(issued, issued.slice(0, -1)),
    false,
  );
  TestValidator.equals(
    "and so is anything longer",
    CodeHudPairingToken.matches(issued, `${issued}x`),
    false,
  );

  const near: string = `${issued.slice(0, -1)}${issued.endsWith("A") ? "B" : "A"}`;
  TestValidator.equals(
    "a same-length near miss is refused",
    CodeHudPairingToken.matches(issued, near),
    false,
  );

  for (const value of [undefined, null, 42, {}, [issued]])
    TestValidator.equals(
      `a ${typeof value} is refused rather than coerced`,
      CodeHudPairingToken.matches(issued, value),
      false,
    );

  const payload: string = CodeHudPairingToken.payload({
    host: "192.168.0.14",
    port: 37219,
    token: issued,
  });
  const parsed: URL = new URL(payload);
  TestValidator.equals(
    "the payload names the host",
    parsed.hostname,
    "192.168.0.14",
  );
  TestValidator.equals("and the port", parsed.port, "37219");
  TestValidator.equals(
    "and carries the credential",
    parsed.searchParams.get("token"),
    issued,
  );
  TestValidator.equals(
    "over the transport's own scheme, so a device connects rather than browses",
    parsed.protocol,
    "ws:",
  );

  const awkward: string = "a+b/c=d&e";
  TestValidator.equals(
    "a token a query string would otherwise eat survives",
    new URL(
      CodeHudPairingToken.payload({
        host: "host",
        port: 1,
        token: awkward,
      }),
    ).searchParams.get("token"),
    awkward,
  );
}
