import { CodeHudSessionRegistry } from "@codehud/bridge";
import { TestValidator } from "@nestia/e2e";

import { Harness } from "../internal/harness";

/**
 * One unreachable device never stalls the harness or the devices beside it.
 *
 * A pair of glasses that went out of range does not close its connection
 * politely; it stops answering. The bridge is the sole consumer of the harness's
 * observations, so if a failed delivery propagated, the agent's whole stream
 * would stop behind a device nobody is wearing any more.
 *
 * The rule is therefore that a rejection drops that device and nothing else. It
 * is checked with two devices attached to one session, because a bridge that
 * stopped the stream outright would still pass a case that had only the broken
 * one.
 *
 * Scenarios:
 *
 * 1. A device whose delivery rejects is tried once and then dropped. Counted
 *    rather than inferred from what it received: what a broken device has seen
 *    is empty whether the bridge gave up on it or kept failing at it on every
 *    observation for the rest of the session, and those are different bridges.
 * 2. The healthy device attached to the same session keeps receiving, in order
 *    and without a gap. The negative twin: without it, a bridge that simply
 *    stopped delivering to everyone would pass scenario 1.
 * 3. The harness keeps producing, and its counter keeps advancing, so nothing
 *    is lost for a device that comes back.
 * 4. The dropped device is replaced, not orphaned: attaching a fresh device from
 *    zero serves the full retained history, including what was produced while
 *    the broken one was failing.
 */
export async function test_bridge_unreachable_device(): Promise<void> {
  const registry: CodeHudSessionRegistry = new CodeHudSessionRegistry();
  const session: Harness.Session = new Harness.Session("s1");
  registry.adopt(session, { kind: "claude-code", directory: "/repo" });

  const gone: Harness.Device = new Harness.Device(true);
  const healthy: Harness.Device = new Harness.Device();
  registry.attach("s1", 0, gone);
  registry.attach("s1", 0, healthy);

  session.emit("one");
  session.emit("two");
  session.emit("three");
  await Harness.settle();

  TestValidator.equals(
    "the unreachable device received nothing",
    gone.seen,
    [],
  );
  TestValidator.equals(
    "the device beside it received everything, in order",
    healthy.seen,
    [0, 1, 2],
  );
  TestValidator.equals(
    "the harness was never closed over a delivery failure",
    session.closed,
    0,
  );
  TestValidator.equals(
    "and its counter kept advancing",
    registry.list()[0]!.sequence,
    3,
  );

  session.emit("four");
  await Harness.settle();
  TestValidator.equals(
    "the stream did not stop behind the dropped device",
    healthy.seen,
    [0, 1, 2, 3],
  );
  TestValidator.equals(
    "and the dropped device was not tried again",
    gone.attempts,
    1,
  );

  const returned: Harness.Device = new Harness.Device();
  registry.attach("s1", 0, returned);
  await Harness.settle();
  TestValidator.equals(
    "a fresh device is served the whole retained history",
    returned.seen,
    [0, 1, 2, 3],
  );
}
