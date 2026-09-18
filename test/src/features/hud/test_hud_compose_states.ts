import type {
  ICodeHudContext,
  ICodeHudFrame,
  ICodeHudState,
} from "@codehud/interface";
import {
  CodeHudComposer,
  CodeHudContext,
  CodeHudReducer,
} from "@codehud/projection";

import { Assert } from "../internal/assert";
import { Stream } from "../internal/stream";

/**
 * Each activity composes to the kind and grade its situation deserves.
 *
 * The grade is the same fact the notification rules act on, so getting it wrong
 * here does not merely mislabel a frame: it decides whether a display wakes in
 * front of someone's eye while they are driving.
 *
 * Scenarios:
 *
 * 1. Connecting is ambient status, because a wearer waiting to connect is
 *    already looking.
 * 2. Idle names the working directory, which is how a wearer running several
 *    agents knows which one they are looking at, and falls back to a standing
 *    line when no session has been reported.
 * 3. A streaming message is ambient-grade and shows its newest words. Ambient
 *    because progress within a turn wakes nothing: an agent writing a paragraph
 *    would otherwise light the display once per sentence. An earlier version
 *    graded it notice, and this case asserted that, which is how a violation of
 *    the stated grade table survived being tested.
 * 4. Working without prose shows the running tool, and falls back to a verb
 *    when there is no history yet, the arm that fires at the very start of a
 *    turn.
 * 5. Thinking without prose says so rather than saying "working", the negative
 *    twin of scenario 4.
 * 6. A successful result is notice-grade; a failed one is demand-grade and
 *    alert-toned, since a failure usually means the wearer must intervene.
 * 7. An interrupted turn is neither failed nor successful: the wearer's own
 *    gesture is never rendered as an error.
 * 8. A fault is demand-grade and shows its message.
 * 9. Done with no recorded result falls back to idle, the defensive arm.
 */
export async function test_hud_compose_states(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  const composer: CodeHudComposer = new CodeHudComposer(CodeHudContext.DEFAULT);
  Stream.reset();
  const fresh: ICodeHudState = reducer.initialize();

  // Read from the configuration rather than repeated as literals. The rule
  // under test is that each situation selects its own entry, not what the
  // default wording happens to be, and the defaults differ from one another,
  // so a composer that selected the wrong entry still fails here.
  const words: ICodeHudContext.IVocabulary = CodeHudContext.DEFAULT.vocabulary;

  const connecting: ICodeHudFrame = composer.compose(fresh, Stream.NARROW);
  Assert.equals("connecting kind", connecting.kind, "status");
  Assert.equals("connecting grade", connecting.urgency, "ambient");

  const bare: ICodeHudFrame = composer.compose(
    { ...fresh, activity: "idle" },
    Stream.NARROW,
  );
  Assert.equals("idle with no session", bare.lines[0]!.text, words.ready);

  const opened: ICodeHudState = reducer.reduce(
    fresh,
    Stream.session("/home/dev/projects/codehud"),
  );
  const idle: ICodeHudFrame = composer.compose(opened, Stream.NARROW);
  Assert.equals("idle kind", idle.kind, "idle");
  Assert.equals("idle grade", idle.urgency, "ambient");
  Assert.predicate(
    "idle names the directory",
    idle.lines[0]!.text.includes("codehud"),
  );

  const streaming: ICodeHudState = reducer.reduce(
    opened,
    Stream.message("the newest words are the ones that matter", false),
  );
  const stream: ICodeHudFrame = composer.compose(streaming, Stream.NARROW);
  Assert.equals("stream kind", stream.kind, "stream");
  Assert.equals("stream grade", stream.urgency, "ambient");
  Assert.predicate(
    "stream shows the newest words",
    stream.lines
      .map((l) => l.text)
      .join(" ")
      .includes("matter"),
  );

  const started: ICodeHudFrame = composer.compose(
    { ...opened, activity: "working" },
    Stream.NARROW,
  );
  Assert.equals(
    "working with no history",
    started.lines[0]!.text,
    words.working,
  );

  const musing: ICodeHudFrame = composer.compose(
    { ...opened, activity: "thinking" },
    Stream.NARROW,
  );
  Assert.equals(
    "thinking with no history",
    musing.lines[0]!.text,
    words.thinking,
  );

  const tooling: ICodeHudState = reducer.reduce(
    opened,
    Stream.tool("c1", "Edit a.ts", "start"),
  );
  const status: ICodeHudFrame = composer.compose(tooling, Stream.NARROW);
  Assert.equals("status kind", status.kind, "status");
  Assert.equals("status shows the tool", status.lines[0]!.text, "Edit a.ts");

  const ok: ICodeHudFrame = composer.compose(
    reducer.reduce(opened, Stream.result("Edited two files", "success")),
    Stream.NARROW,
  );
  Assert.equals("success kind", ok.kind, "result");
  Assert.equals("success grade", ok.urgency, "notice");
  Assert.equals("success tone", ok.lines[0]!.tone, "primary");
  Assert.predicate(
    "success verdict",
    ok.lines[1]!.text.startsWith(words.succeeded),
  );

  const bad: ICodeHudFrame = composer.compose(
    reducer.reduce(opened, Stream.result("The suite failed", "error")),
    Stream.NARROW,
  );
  Assert.equals("failure grade", bad.urgency, "demand");
  Assert.equals("failure tone", bad.lines[0]!.tone, "alert");
  Assert.predicate(
    "failure verdict",
    bad.lines[1]!.text.startsWith(words.failed),
  );

  const stopped: ICodeHudFrame = composer.compose(
    reducer.reduce(opened, Stream.result("Stopped by you", "interrupted")),
    Stream.NARROW,
  );
  Assert.equals("interruption is not a failure", stopped.urgency, "notice");
  Assert.equals("interruption tone", stopped.lines[0]!.tone, "primary");
  Assert.predicate(
    "interruption verdict",
    stopped.lines[1]!.text.startsWith(words.stopped),
  );

  const fault: ICodeHudFrame = composer.compose(
    reducer.reduce(opened, Stream.error("claude exited", true)),
    Stream.NARROW,
  );
  Assert.equals("fault kind", fault.kind, "fault");
  Assert.equals("fault grade", fault.urgency, "demand");
  Assert.equals(
    "fault shows the message",
    fault.lines[0]!.text,
    "claude exited",
  );

  const empty: ICodeHudFrame = composer.compose(
    { ...opened, activity: "done" },
    Stream.NARROW,
  );
  Assert.equals("done with no result falls back", empty.kind, "idle");
}
