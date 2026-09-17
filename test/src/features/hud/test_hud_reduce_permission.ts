import type { ICodeHudState } from "@codehud/interface";
import { CodeHudReducer } from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

import { Stream } from "../internal/stream";

/**
 * A pending approval blocks, is cleared only by its own answer, and never by
 * elapsed time.
 *
 * Settling optimistically rather than waiting for the harness matters because
 * the gap between an answer and the next observation is long enough for a
 * wearer to speak again and answer the following request by mistake.
 *
 * Scenarios:
 *
 * 1. A request sets waiting and holds the whole observation, since the composer
 *    needs its title, detail, and options.
 * 2. Answering it clears the request and resumes working.
 * 3. Answering a different identifier changes nothing, the negative twin that
 *    proves the clear is keyed by request rather than merely "something was
 *    answered".
 * 4. Answering when nothing is pending changes nothing, the boundary where a
 *    late answer arrives after a result already cleared the request.
 * 5. A result clears a pending request, since the turn ended without it.
 */
export async function test_hud_reduce_permission(): Promise<void> {
  Stream.reset();
  const opened: ICodeHudState = CodeHudReducer.reduce(
    CodeHudReducer.initialize(),
    Stream.session(),
  );

  const asked: ICodeHudState = CodeHudReducer.reduce(
    opened,
    Stream.permission("r1", "Write src/index.ts", "Creates a new file."),
  );
  TestValidator.equals("waiting", asked.activity, "waiting");
  TestValidator.equals("request held", asked.pending?.request, "r1");
  TestValidator.equals(
    "title held",
    asked.pending?.title,
    "Write src/index.ts",
  );
  TestValidator.equals("options held", asked.pending?.options.length, 3);

  const answered: ICodeHudState = CodeHudReducer.settle(asked, "r1");
  TestValidator.equals("cleared", answered.pending, undefined);
  TestValidator.equals("resumes working", answered.activity, "working");

  const wrong: ICodeHudState = CodeHudReducer.settle(asked, "r2");
  TestValidator.equals("a foreign answer changes nothing", wrong, asked);

  const none: ICodeHudState = CodeHudReducer.settle(opened, "r1");
  TestValidator.equals("answering nothing changes nothing", none, opened);

  Stream.reset();
  const asked2: ICodeHudState = CodeHudReducer.reduce(
    CodeHudReducer.reduce(CodeHudReducer.initialize(), Stream.session()),
    Stream.permission("r9", "Delete build/"),
  );
  const ended: ICodeHudState = CodeHudReducer.reduce(
    asked2,
    Stream.result("Nothing changed", "interrupted"),
  );
  TestValidator.equals("a result clears the request", ended.pending, undefined);
  TestValidator.equals("and ends the turn", ended.activity, "done");
}
