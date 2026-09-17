import type { ICodeHudContext, ICodeHudFrame } from "@codehud/interface";
import {
  CodeHudComposer,
  CodeHudContext,
  CodeHudReducer,
} from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

import { Stream } from "../internal/stream";

/**
 * Configuration reaches the display, and the default cannot be mutated by one
 * consumer on behalf of another.
 *
 * The point of taking a context is that every word the system originates is a
 * stated choice rather than a literal. A refactor that threaded the context
 * through without actually reading it would pass every other case in this
 * suite, so this one changes the configuration and demands that the output
 * change with it.
 *
 * Scenarios:
 *
 * 1. Stating nothing yields the defaults.
 * 2. Stating one section replaces only that section, and stating one word of a
 *    section keeps the rest of it. A deep default that dropped its siblings
 *    would leave a display rendering `undefined`.
 * 3. The default is frozen, so a consumer cannot mutate a shared configuration
 *    and surface the bug somewhere else entirely.
 * 4. A changed standing label reaches the frame, the negative twin that proves
 *    the composer reads the context rather than a literal.
 * 5. A changed verdict reaches the frame.
 * 6. A changed hint vocabulary reaches the spoken hint.
 * 7. A changed history cap reaches the reducer, which is the one configuration
 *    the fold rather than the projection consumes.
 */
export async function test_hud_context(): Promise<void> {
  TestValidator.equals(
    "stating nothing yields the defaults",
    CodeHudContext.create(),
    CodeHudContext.DEFAULT,
  );

  const partial: ICodeHudContext = CodeHudContext.create({
    vocabulary: { ready: "Idle" },
  });
  TestValidator.equals("stated word applied", partial.vocabulary.ready, "Idle");
  TestValidator.equals(
    "siblings survive a partial section",
    partial.vocabulary.working,
    CodeHudContext.DEFAULT.vocabulary.working,
  );
  TestValidator.equals(
    "untouched sections survive",
    partial.consent,
    CodeHudContext.DEFAULT.consent,
  );

  TestValidator.equals(
    "the default is frozen",
    Object.isFrozen(CodeHudContext.DEFAULT),
    true,
  );
  TestValidator.equals(
    "and so are its sections",
    Object.isFrozen(CodeHudContext.DEFAULT.vocabulary),
    true,
  );

  Stream.reset();
  const context: ICodeHudContext = CodeHudContext.create({
    history: 2,
    vocabulary: {
      ready: "NOTHING DOING",
      failed: "BROKE",
      say: "SPEAK",
      or: "OTHERWISE",
    },
  });
  const reducer: CodeHudReducer = new CodeHudReducer(context);
  const composer: CodeHudComposer = new CodeHudComposer(context);

  const opened = reducer.reduce(reducer.initialize(), Stream.session());

  // The standing label appears only when there is no session to name instead,
  // which is the whole reason it exists.
  TestValidator.equals(
    "a changed standing label reaches the frame",
    composer.compose(
      { ...reducer.initialize(), activity: "idle" },
      Stream.NARROW,
    ).lines[0]!.text,
    "NOTHING DOING",
  );
  TestValidator.predicate(
    "and a session outranks it",
    composer.compose(opened, Stream.NARROW).lines[0]!.text.includes("codehud"),
  );

  const failed: ICodeHudFrame = composer.compose(
    reducer.reduce(opened, Stream.result("The suite failed", "error")),
    Stream.NARROW,
  );
  TestValidator.predicate(
    "a changed verdict reaches the frame",
    failed.lines[1]!.text.startsWith("BROKE"),
  );

  const asked: ICodeHudFrame = composer.compose(
    reducer.reduce(opened, Stream.permission("r1", "Write a.ts")),
    Stream.WIDE,
  );
  TestValidator.equals(
    "a changed hint vocabulary reaches the hint",
    asked.hint,
    "SPEAK Allow OTHERWISE Deny",
  );

  let bounded = opened;
  for (let i = 0; i < 5; ++i)
    bounded = reducer.reduce(
      bounded,
      Stream.tool(`c${i}`, `Edit ${i}.ts`, "finish", false),
    );
  TestValidator.equals(
    "a changed history cap reaches the reducer",
    bounded.history.length,
    2,
  );
}
