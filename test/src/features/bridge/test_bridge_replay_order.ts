import { CodeHudSessionRegistry } from "@codehud/bridge";
import { TestValidator } from "@nestia/e2e";

import { Harness } from "../internal/harness";

/**
 * Every device receives an ascending, gapless run of counters.
 *
 * This is the invariant the client's replay guard depends on, and the reason it
 * is not merely a nicety. The client discards an observation whose counter is at
 * or below the highest it has folded. So a live observation overtaking a
 * replayed one does not arrive early and get reordered later: it makes the
 * client discard everything the replay was for, permanently. A device that
 * reattached to catch up would end up with less than it started with.
 *
 * The bridge therefore stamps the counter itself and serializes delivery per
 * device. The fixture emits observations already carrying a wrong counter and a
 * wrong session identifier, so a bridge that passed the adapter's values through
 * instead of stamping its own fails here rather than somewhere subtler.
 *
 * Scenarios:
 *
 * 1. Counters start at one and ascend, and the session identifier is the
 *    bridge's, so zero can mean "I hold nothing, send everything".
 * 2. A device attached from the start receives each observation once, in order.
 * 3. A device attaching afterwards is replayed from the counter it names, and
 *    receives nothing before it.
 * 4. A device attaching mid-stream, with observations produced in the same turn
 *    as the attach, still receives an ascending gapless run. This is the race
 *    the serialization exists for, and it is checked against a device whose
 *    older deliveries take longer than its newer ones. Against a device of even
 *    latency the case proves nothing: turns are handed out in the order they
 *    were asked for, so an unserialized bridge comes out sorted anyway. That
 *    was the first version of this case, and a bridge with its serialization
 *    deleted passed it.
 * 5. Attaching from beyond what exists yields nothing rather than failing, since
 *    a device that missed nothing asks for nothing.
 * 6. The retained observations are not consumed by being replayed: a third
 *    device asking for everything still gets everything.
 */
export async function test_bridge_replay_order(): Promise<void> {
  const registry: CodeHudSessionRegistry = new CodeHudSessionRegistry();
  const session: Harness.Session = new Harness.Session("s1");
  registry.adopt(session, { kind: "claude-code", directory: "/repo" });

  const early: Harness.Device = new Harness.Device();
  registry.attach("s1", 0, early);

  session.emit("one");
  session.emit("two");
  await Harness.settle();

  TestValidator.equals("counters start at one and ascend", early.seen, [1, 2]);
  TestValidator.equals(
    "the bridge stamps its own session identifier",
    registry.list()[0]!.sequence,
    2,
  );

  const late: Harness.Device = new Harness.Device();
  registry.attach("s1", 2, late);
  await Harness.settle();
  TestValidator.equals("replay starts where the device asked", late.seen, [2]);

  // The race: a device attaches and the harness speaks in the same turn, before
  // anything the attach queued has been delivered. Its replayed observations
  // take longer to deliver than the live ones behind them, which is the shape a
  // real catch-up has and the only shape that can tell a serialized fan-out
  // from an unserialized one.
  const racing: Harness.Device = new Harness.Device(
    false,
    Harness.Device.REPLAY_IS_SLOWER,
  );
  registry.attach("s1", 1, racing);
  session.emit("three");
  session.emit("four");
  await Harness.settle();

  TestValidator.equals(
    "a device attaching mid-stream receives a gapless ascending run",
    racing.seen,
    [1, 2, 3, 4],
  );
  TestValidator.equals(
    "and so does the device that was there all along",
    early.seen,
    [1, 2, 3, 4],
  );
  TestValidator.equals(
    "and the one that joined late, from where it asked",
    late.seen,
    [2, 3, 4],
  );

  const beyond: Harness.Device = new Harness.Device();
  registry.attach("s1", 99, beyond);
  await Harness.settle();
  TestValidator.equals("asking beyond the end yields nothing", beyond.seen, []);

  const everything: Harness.Device = new Harness.Device();
  registry.attach("s1", 0, everything);
  await Harness.settle();
  TestValidator.equals(
    "replaying does not consume what was retained",
    everything.seen,
    [1, 2, 3, 4],
  );
}
