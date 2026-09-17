import type { ICodeHudFrame, ICodeHudState } from "@codehud/interface";
import { CodeHudComposer, CodeHudReducer } from "@codehud/projection";
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
  Stream.reset();
  const fresh: ICodeHudState = CodeHudReducer.initialize();

  const connecting: ICodeHudFrame = CodeHudComposer.compose(
    fresh,
    Stream.NARROW,
  );
  TestValidator.equals("connecting kind", connecting.kind, "status");
  TestValidator.equals("connecting grade", connecting.urgency, "ambient");

  const bare: ICodeHudFrame = CodeHudComposer.compose(
    { ...fresh, activity: "idle" },
    Stream.NARROW,
  );
  TestValidator.equals("idle with no session", bare.lines[0]!.text, "Ready");

  const opened: ICodeHudState = CodeHudReducer.reduce(
    fresh,
    Stream.session("/home/dev/projects/codehud"),
  );
  const idle: ICodeHudFrame = CodeHudComposer.compose(opened, Stream.NARROW);
  TestValidator.equals("idle kind", idle.kind, "idle");
  TestValidator.equals("idle grade", idle.urgency, "ambient");
  TestValidator.predicate(
    "idle names the directory",
    idle.lines[0]!.text.includes("codehud"),
  );

  const streaming: ICodeHudState = CodeHudReducer.reduce(
    opened,
    Stream.message("the newest words are the ones that matter", false),
  );
  const stream: ICodeHudFrame = CodeHudComposer.compose(
    streaming,
    Stream.NARROW,
  );
  TestValidator.equals("stream kind", stream.kind, "stream");
  TestValidator.equals("stream grade", stream.urgency, "notice");
  TestValidator.predicate(
    "stream shows the newest words",
    stream.lines
      .map((l) => l.text)
      .join(" ")
      .includes("matter"),
  );

  const started: ICodeHudFrame = CodeHudComposer.compose(
    { ...opened, activity: "working" },
    Stream.NARROW,
  );
  TestValidator.equals(
    "working with no history",
    started.lines[0]!.text,
    "Working",
  );

  const musing: ICodeHudFrame = CodeHudComposer.compose(
    { ...opened, activity: "thinking" },
    Stream.NARROW,
  );
  TestValidator.equals(
    "thinking with no history",
    musing.lines[0]!.text,
    "Thinking",
  );

  const tooling: ICodeHudState = CodeHudReducer.reduce(
    opened,
    Stream.tool("c1", "Edit a.ts", "start"),
  );
  const status: ICodeHudFrame = CodeHudComposer.compose(tooling, Stream.NARROW);
  TestValidator.equals("status kind", status.kind, "status");
  TestValidator.equals(
    "status shows the tool",
    status.lines[0]!.text,
    "Edit a.ts",
  );

  const ok: ICodeHudFrame = CodeHudComposer.compose(
    CodeHudReducer.reduce(opened, Stream.result("Edited two files", "success")),
    Stream.NARROW,
  );
  TestValidator.equals("success kind", ok.kind, "result");
  TestValidator.equals("success grade", ok.urgency, "notice");
  TestValidator.equals("success tone", ok.lines[0]!.tone, "primary");
  TestValidator.predicate(
    "success verdict",
    ok.lines[1]!.text.startsWith("Done"),
  );

  const bad: ICodeHudFrame = CodeHudComposer.compose(
    CodeHudReducer.reduce(opened, Stream.result("The suite failed", "error")),
    Stream.NARROW,
  );
  TestValidator.equals("failure grade", bad.urgency, "demand");
  TestValidator.equals("failure tone", bad.lines[0]!.tone, "alert");
  TestValidator.predicate(
    "failure verdict",
    bad.lines[1]!.text.startsWith("Failed"),
  );

  const stopped: ICodeHudFrame = CodeHudComposer.compose(
    CodeHudReducer.reduce(
      opened,
      Stream.result("Stopped by you", "interrupted"),
    ),
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
    stopped.lines[1]!.text.startsWith("Stopped"),
  );

  const fault: ICodeHudFrame = CodeHudComposer.compose(
    CodeHudReducer.reduce(opened, Stream.error("claude exited", true)),
    Stream.NARROW,
  );
  TestValidator.equals("fault kind", fault.kind, "fault");
  TestValidator.equals("fault grade", fault.urgency, "demand");
  TestValidator.equals(
    "fault shows the message",
    fault.lines[0]!.text,
    "claude exited",
  );

  const empty: ICodeHudFrame = CodeHudComposer.compose(
    { ...opened, activity: "done" },
    Stream.NARROW,
  );
  TestValidator.equals("done with no result falls back", empty.kind, "idle");
}
