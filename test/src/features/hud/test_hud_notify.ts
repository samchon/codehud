import type { ICodeHudFrame, ICodeHudState } from "@codehud/interface";
import {
  CodeHudComposer,
  CodeHudContext,
  CodeHudNotifier,
  CodeHudReducer,
} from "@codehud/projection";

import { Assert } from "../internal/assert";
import { Stream } from "../internal/stream";

/**
 * What a device may do about a frame, and what it owes when it cannot.
 *
 * The grades are not a hint. They decide whether a display lights up in front
 * of someone's eye while they are driving, so the table is fixed and total, and
 * what it returns is an upper bound rather than an instruction.
 *
 * Quiet mode is the part that is easy to get wrong in the harmful direction. It
 * changes presentation only: an approval suppressed by it still blocks its
 * session, still waits, and is still the wearer's to answer. A quiet mode that
 * quietly denied would be a system answering on the wearer's behalf, and the
 * wrong answer cannot be undone.
 *
 * Scenarios:
 *
 * 1. The three grades permit exactly what the specification says: demand wakes
 *    and speaks, notice wakes and is silent, ambient does neither.
 * 2. Quiet mode removes both permissions from every grade, demand included.
 * 3. A suppressed demand item is deferred, and leaving quiet mode returns every
 *    one of them in arrival order. Nothing is dropped or coalesced.
 * 4. Suppression changes nothing about the session: the approval is still
 *    pending and still answerable while quiet.
 * 5. Only demand has anywhere else to go. A notice the wearer cannot see is not
 *    routed to the host, because missing it costs them nothing.
 * 6. An unreachable device produces a fallback naming why, and the reason
 *    distinguishes a sleeping display from a lost connection.
 * 7. Leaving quiet mode twice returns nothing the second time, because the
 *    first time took it.
 * 8. What an unreachable device missed is not held for a later quiet-mode exit.
 *    It goes to the host and nowhere else: the approval is still pending, so a
 *    device that comes back is shown it again by the ordinary path, while
 *    holding it would mean an hour of disconnection landing in front of the
 *    wearer at whatever unrelated moment they next left a meeting.
 */
export async function test_hud_notify(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  const composer: CodeHudComposer = new CodeHudComposer(CodeHudContext.DEFAULT);
  Stream.reset();

  const opened: ICodeHudState = reducer.reduce(
    reducer.initialize(),
    Stream.session("/home/dev/projects/codehud"),
  );
  const asking: ICodeHudState = reducer.reduce(
    opened,
    Stream.permission("r1", "Write src/index.ts", "Creates a new file."),
  );
  const working: ICodeHudState = reducer.reduce(
    opened,
    Stream.message("still going", false),
  );
  const done: ICodeHudState = reducer.reduce(
    opened,
    Stream.result("Edited two files", "success"),
  );

  const frame = (state: ICodeHudState): ICodeHudFrame =>
    composer.compose(state, Stream.WIDE);

  Assert.equals("an approval is demand", frame(asking).urgency, "demand");
  Assert.equals("a finished turn is notice", frame(done).urgency, "notice");
  Assert.equals("progress is ambient", frame(working).urgency, "ambient");

  const notifier: CodeHudNotifier = new CodeHudNotifier();
  Assert.equals(
    "demand may wake and speak",
    notifier.present(frame(asking), asking),
    { wake: true, speak: true },
  );
  Assert.equals(
    "notice may wake and may not speak",
    notifier.present(frame(done), done),
    { wake: true, speak: false },
  );
  Assert.equals(
    "ambient may do neither",
    notifier.present(frame(working), working),
    { wake: false, speak: false },
  );

  // Quiet mode, including over demand.
  const quiet: CodeHudNotifier = new CodeHudNotifier();
  quiet.silence(true);
  Assert.equals("quiet mode is on", quiet.silenced, true);

  const suppressed = quiet.present(frame(asking), asking);
  Assert.equals("a suppressed approval wakes nothing", suppressed.wake, false);
  Assert.equals("and says nothing", suppressed.speak, false);
  Assert.equals(
    "but is routed to the host, naming why",
    suppressed.fallback?.reason,
    "quiet",
  );
  Assert.equals(
    "and the session is untouched: it is still pending",
    suppressed.fallback?.notification.pending,
    true,
  );
  Assert.predicate(
    "and still says which session it concerns",
    suppressed.fallback?.notification.directory?.includes("codehud") === true,
  );

  // A notice has nowhere else to go, because missing it costs nothing.
  const ignored = quiet.present(frame(done), done);
  Assert.equals(
    "a suppressed notice is not routed",
    ignored.fallback,
    undefined,
  );

  const second: ICodeHudState = reducer.reduce(
    opened,
    Stream.permission("r2", "Delete build/", "Removes generated output."),
  );
  quiet.present(frame(second), second);

  const released = quiet.silence(false);
  Assert.equals("leaving quiet mode is leaving it", quiet.silenced, false);
  Assert.equals("everything held comes back", released.length, 2);
  Assert.equals(
    "in the order it arrived, with nothing coalesced",
    released.map((item) => item.frame.lines[0]!.text.slice(0, 6)),
    ["Write ", "Delete"],
  );
  Assert.equals("and nothing is left behind", quiet.waiting.deferred, []);
  Assert.equals("leaving it again returns nothing", quiet.silence(false), []);

  // Unreachable, with the two reasons distinguished.
  const away: CodeHudNotifier = new CodeHudNotifier();
  Assert.equals(
    "a lost connection says so",
    away.present(frame(asking), asking, { reachable: false }).fallback?.reason,
    "disconnected",
  );
  Assert.equals(
    "a sleeping display says something else",
    away.present(frame(asking), asking, { reachable: false, asleep: true })
      .fallback?.reason,
    "asleep",
  );
  Assert.equals(
    "and an unreachable device is permitted nothing",
    away.present(frame(asking), asking, { reachable: false }).wake,
    false,
  );
  Assert.equals(
    "while a reachable one is permitted everything demand allows",
    away.present(frame(asking), asking).wake,
    true,
  );
  Assert.equals(
    "and has nowhere else to send it",
    away.present(frame(asking), asking).fallback,
    undefined,
  );

  // What being away leaves behind, which is nothing.
  Assert.equals(
    "an unreachable device holds nothing for later",
    away.waiting.deferred,
    [],
  );
  away.silence(true);
  Assert.equals(
    "so a quiet mode entered afterwards starts empty",
    away.waiting.deferred,
    [],
  );
  away.present(frame(asking), asking);
  Assert.equals(
    "and returns only what it suppressed itself",
    away.silence(false).length,
    1,
  );
}
