import type {
  ICodeHudFrame,
  ICodeHudGlassesDescriptor,
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
 * Composed content never exceeds the geometry it was given, for every content
 * kind and every supported surface.
 *
 * This is the invariant an adapter relies on to draw without measuring. It is
 * checked as a property over the cross product of states and geometries rather
 * than one case per kind, because the failures that matter are the combinations
 * nobody thought to write a case for: a fault message on one row, a streaming
 * message on a narrow surface, a review position line where the hint already
 * took the last row.
 *
 * Scenarios:
 *
 * 1. Every state reachable through the reducer, composed at every supported
 *    geometry, keeps every line within the column count.
 * 2. The same, for the row count, counting the spoken hint as a row.
 * 3. Every frame carries a grade, since a frame with no grade is a defect
 *    rather than an implicit ambient.
 * 4. Every frame carries at least one line, so a device is never handed an
 *    empty screen with nothing to explain it.
 * 5. The key changes when the visible content changes, which is what lets an
 *    adapter skip a redundant draw without skipping a real one.
 */
export async function test_hud_compose_geometry(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  const composer: CodeHudComposer = new CodeHudComposer(CodeHudContext.DEFAULT);
  const geometries: ICodeHudGlassesDescriptor.IGeometry[] = [
    Stream.SINGLE,
    Stream.NARROW,
    Stream.WIDE,
    { columns: 12, rows: 2, colored: false },
    { columns: 80, rows: 8, colored: true },
  ];

  const states: { name: string; state: ICodeHudState }[] = [];
  const push = (name: string, state: ICodeHudState): void => {
    states.push({ name, state });
  };

  Stream.reset();
  let s: ICodeHudState = reducer.initialize();
  push("connecting", s);

  s = reducer.reduce(s, Stream.session("/home/dev/projects/codehud"));
  push("idle", s);

  s = reducer.reduce(s, Stream.reasoning("considering the options"));
  push("thinking", s);

  s = reducer.reduce(
    s,
    Stream.tool(
      "c1",
      "Edit packages/projection/src/CodeHudComposer.ts",
      "start",
    ),
  );
  push("working with a tool", s);

  s = reducer.reduce(
    s,
    Stream.message(
      "The composer fits every line before the adapter sees it, ",
      false,
    ),
  );
  push("streaming", s);

  s = reducer.reduce(s, Stream.message("which is the whole point.", true));
  push("streamed and recorded", s);

  const asked: ICodeHudState = reducer.reduce(
    s,
    Stream.permission(
      "r1",
      "Write packages/projection/src/internal/CodeHudText.ts",
      "Creates a new file of one hundred and eighty lines.",
    ),
  );
  push("awaiting approval", asked);

  const done: ICodeHudState = reducer.reduce(
    s,
    Stream.result("Edited two files and ran the suite", "success"),
  );
  push("done", done);

  const failed: ICodeHudState = reducer.reduce(
    s,
    Stream.result("The suite failed on three cases", "error"),
  );
  push("failed", failed);

  push("reviewing", reducer.review(done, "back"));
  push(
    "faulted",
    reducer.reduce(
      s,
      Stream.error("claude exited with code 1 before answering", true),
    ),
  );

  for (const { name, state } of states)
    for (const geometry of geometries) {
      const frame: ICodeHudFrame = composer.compose(state, geometry);
      const where = `${name} at ${geometry.columns}x${geometry.rows}`;

      for (const line of frame.lines)
        TestValidator.predicate(
          `${where}: line within ${geometry.columns} columns`,
          line.text.length <= geometry.columns,
        );

      if (frame.hint !== undefined)
        TestValidator.predicate(
          `${where}: hint within ${geometry.columns} columns`,
          frame.hint.length <= geometry.columns,
        );

      TestValidator.predicate(
        `${where}: lines plus hint within ${geometry.rows} rows`,
        frame.lines.length + (frame.hint === undefined ? 0 : 1) <=
          geometry.rows,
      );

      TestValidator.predicate(
        `${where}: carries a grade`,
        ["ambient", "notice", "demand"].includes(frame.urgency),
      );

      TestValidator.predicate(
        `${where}: says something`,
        frame.lines.length >= 1,
      );
    }

  const before: ICodeHudFrame = composer.compose(done, Stream.NARROW);
  const after: ICodeHudFrame = composer.compose(failed, Stream.NARROW);
  TestValidator.predicate(
    "the key follows the visible content",
    before.key !== after.key,
  );
  TestValidator.equals(
    "and is stable for unchanged content",
    composer.compose(done, Stream.NARROW).key,
    before.key,
  );
}
