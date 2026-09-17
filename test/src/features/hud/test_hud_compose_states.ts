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
import { TestValidator } from "@nestia/e2e";

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
 * 3. A streaming message is notice-grade and shows its newest words.
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
  TestValidator.equals("connecting kind", connecting.kind, "status");
  TestValidator.equals("connecting grade", connecting.urgency, "ambient");

  const bare: ICodeHudFrame = composer.compose(
    { ...fresh, activity: "idle" },
    Stream.NARROW,
  );
  TestValidator.equals(
    "idle with no session",
    bare.lines[0]!.text,
    words.ready,
  );

  const opened: ICodeHudState = reducer.reduce(
    fresh,
    Stream.session("/home/dev/projects/codehud"),
  );
  const idle: ICodeHudFrame = composer.compose(opened, Stream.NARROW);
  TestValidator.equals("idle kind", idle.kind, "idle");
  TestValidator.equals("idle grade", idle.urgency, "ambient");
  TestValidator.predicate(
    "idle names the directory",
    idle.lines[0]!.text.includes("codehud"),
  );

  const streaming: ICodeHudState = reducer.reduce(
    opened,
    Stream.message("the newest words are the ones that matter", false),
  );
  const stream: ICodeHudFrame = composer.compose(streaming, Stream.NARROW);
  TestValidator.equals("stream kind", stream.kind, "stream");
  TestValidator.equals("stream grade", stream.urgency, "notice");
  TestValidator.predicate(
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
  TestValidator.equals(
    "working with no history",
    started.lines[0]!.text,
    words.working,
  );

  const musing: ICodeHudFrame = composer.compose(
    { ...opened, activity: "thinking" },
    Stream.NARROW,
  );
  TestValidator.equals(
    "thinking with no history",
    musing.lines[0]!.text,
    words.thinking,
  );

  const tooling: ICodeHudState = reducer.reduce(
    opened,
    Stream.tool("c1", "Edit a.ts", "start"),
  );
  const status: ICodeHudFrame = composer.compose(tooling, Stream.NARROW);
  TestValidator.equals("status kind", status.kind, "status");
  TestValidator.equals(
    "status shows the tool",
    status.lines[0]!.text,
    "Edit a.ts",
  );

  const ok: ICodeHudFrame = composer.compose(
    reducer.reduce(opened, Stream.result("Edited two files", "success")),
    Stream.NARROW,
  );
  TestValidator.equals("success kind", ok.kind, "result");
  TestValidator.equals("success grade", ok.urgency, "notice");
  TestValidator.equals("success tone", ok.lines[0]!.tone, "primary");
  TestValidator.predicate(
    "success verdict",
    ok.lines[1]!.text.startsWith(words.succeeded),
  );

  const bad: ICodeHudFrame = composer.compose(
    reducer.reduce(opened, Stream.result("The suite failed", "error")),
    Stream.NARROW,
  );
  TestValidator.equals("failure grade", bad.urgency, "demand");
  TestValidator.equals("failure tone", bad.lines[0]!.tone, "alert");
  TestValidator.predicate(
    "failure verdict",
    bad.lines[1]!.text.startsWith(words.failed),
  );

  const stopped: ICodeHudFrame = composer.compose(
    reducer.reduce(opened, Stream.result("Stopped by you", "interrupted")),
    Stream.NARROW,
  );
  TestValidator.equals(
    "interruption is not a failure",
    stopped.urgency,
    "notice",
  );
  TestValidator.equals("interruption tone", stopped.lines[0]!.tone, "primary");
  TestValidator.predicate(
    "interruption verdict",
    stopped.lines[1]!.text.startsWith(words.stopped),
  );

  const fault: ICodeHudFrame = composer.compose(
    reducer.reduce(opened, Stream.error("claude exited", true)),
    Stream.NARROW,
  );
  TestValidator.equals("fault kind", fault.kind, "fault");
  TestValidator.equals("fault grade", fault.urgency, "demand");
  TestValidator.equals(
    "fault shows the message",
    fault.lines[0]!.text,
    "claude exited",
  );

  const empty: ICodeHudFrame = composer.compose(
    { ...opened, activity: "done" },
    Stream.NARROW,
  );
  TestValidator.equals("done with no result falls back", empty.kind, "idle");
}
