import { CodeHudSessionRegistry } from "@codehud/bridge";
import { TestValidator } from "@nestia/e2e";

import { Harness } from "../internal/harness";

/**
 * Losing a device changes nothing about the session it was watching.
 *
 * The rule the whole product rests on. A wearer walks out of range in the middle
 * of a turn; the harness on their machine has no idea and must not be told. If
 * detaching ended the session, every doorway would cancel the work.
 *
 * So the session's lifetime is bound to the bridge and to an explicit close, and
 * observations produced while nobody was watching are retained rather than
 * dropped. The proof that they were retained is that a returning device is
 * served them.
 *
 * Scenarios:
 *
 * 1. Detaching stops delivery to that device.
 * 2. The harness is not closed, not asked to close, and keeps producing.
 * 3. The session stays advertised, with its counter still advancing, so a
 *    returning device can see what it missed before asking for it.
 * 4. Reattaching from the counter it held serves exactly what accumulated while
 *    it was away. This is what makes scenario 2 observable rather than merely
 *    asserted.
 * 5. Closing is explicit, closes the harness once, and removes the session.
 * 6. Closing again is harmless, because a device and a shutdown handler may both
 *    reach for it, and it does not reach the harness a second time.
 * 7. Detaching a device that was never attached is harmless.
 */
export async function test_bridge_detach_is_not_close(): Promise<void> {
  const registry: CodeHudSessionRegistry = new CodeHudSessionRegistry();
  const session: Harness.Session = new Harness.Session("s1");
  registry.adopt(session, { kind: "codex", directory: "/repo" });

  const device: Harness.Device = new Harness.Device();
  registry.attach("s1", 0, device);
  session.emit("before");
  await Harness.settle();
  TestValidator.equals("delivered while attached", device.seen, [0]);

  registry.detach(device);
  session.emit("while away");
  session.emit("still away");
  await Harness.settle();

  TestValidator.equals("nothing arrives after detaching", device.seen, [0]);
  TestValidator.equals("the harness was never closed", session.closed, 0);
  TestValidator.equals(
    "the session is still advertised",
    registry.list().length,
    1,
  );
  TestValidator.equals(
    "and its counter kept advancing with nobody watching",
    registry.list()[0]!.sequence,
    3,
  );

  registry.attach("s1", 1, device);
  await Harness.settle();
  TestValidator.equals(
    "returning serves exactly what accumulated while away",
    device.seen,
    [0, 1, 2],
  );

  await registry.close("s1");
  TestValidator.equals("closing reaches the harness once", session.closed, 1);
  TestValidator.equals("and removes the session", registry.list().length, 0);

  await registry.close("s1");
  TestValidator.equals(
    "closing again does not reach the harness twice",
    session.closed,
    1,
  );

  registry.detach(new Harness.Device());
  TestValidator.equals(
    "detaching a stranger is harmless",
    registry.list().length,
    0,
  );
}
