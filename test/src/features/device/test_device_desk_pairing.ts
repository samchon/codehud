import { CodeHudPairingToken } from "@codehud/bridge";
import { CodeHudDeskCommand } from "@codehud/simulator";
import { TestValidator } from "@nestia/e2e";

import { Assert } from "../internal/assert";

/**
 * A desk reads the same pairing code a phone would scan.
 *
 * The bridge prints one string carrying three facts: the scheme a device
 * connects with, the address on the wearer's own network, and the credential.
 * A second spelling of those three for the desk would be a second thing to keep
 * in step with the bridge, and the first release where they disagreed would
 * look like a broken bridge rather than like two parsers.
 *
 * So the host takes the payload verbatim and the bridge's own builder produces
 * the input here. That is what makes this a round trip rather than a check that
 * a regular expression matches a string somebody typed twice.
 *
 * Scenarios:
 *
 * 1. What the bridge builds is what the host reads: the address it dials and
 *    the token it presents come back out.
 * 2. The token survives characters a URL would otherwise eat, which is not
 *    hypothetical — the issued token is base64url and its alphabet includes
 *    both of them.
 * 3. An address carrying no token is refused rather than dialled with an empty
 *    credential, which the bridge would refuse anyway and one step later.
 */
export async function test_device_desk_pairing(): Promise<void> {
  const payload: string = CodeHudPairingToken.payload({
    host: "192.168.0.14",
    port: 37219,
    token: "tDwB0Pf9jahsv55JsdzS0w",
  });
  const read = CodeHudDeskCommand.paired(payload);
  TestValidator.equals(
    "the address the bridge named is the one dialled",
    read.address,
    "ws://192.168.0.14:37219/",
  );
  TestValidator.equals(
    "and the credential comes back whole",
    read.token,
    "tDwB0Pf9jahsv55JsdzS0w",
  );

  const awkward: string = CodeHudPairingToken.payload({
    host: "127.0.0.1",
    port: 37219,
    token: "a-b_c=d+e/f",
  });
  TestValidator.equals(
    "a token is not damaged by the address carrying it",
    CodeHudDeskCommand.paired(awkward).token,
    "a-b_c=d+e/f",
  );

  await Assert.throws("an address with no token is refused", () =>
    CodeHudDeskCommand.paired("ws://127.0.0.1:37219/"),
  );
  await Assert.throws("and one with an empty token likewise", () =>
    CodeHudDeskCommand.paired("ws://127.0.0.1:37219/?token="),
  );
  TestValidator.predicate(
    "and the wrapper that says so would have reported one that did not refuse",
    (await Assert.reports(() => undefined)) === true,
  );
  TestValidator.predicate(
    "including one that did not refuse asynchronously",
    (await Assert.reports(async () => undefined)) === true,
  );
}
