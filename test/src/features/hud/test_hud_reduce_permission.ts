import type { ICodeHudState } from "@codehud/interface";
import { CodeHudContext, CodeHudReducer } from "@codehud/projection";
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
 * 6. A request can be moved to waiting for its second answer and back, keyed by
 *    its own identifier like every other local move, and it stays pending
 *    throughout: the harness has been told nothing, so nothing is answered.
 * 7. Nothing carries that state into another request. A new request, a result,
 *    a fault, and an answer each leave it waiting for a first answer, because a
 *    flag that survived any of them would let one word answer a question the
 *    wearer was never asked twice about.
 */
export async function test_hud_reduce_permission(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  Stream.reset();
  const opened: ICodeHudState = reducer.reduce(
    reducer.initialize(),
    Stream.session(),
  );

  const asked: ICodeHudState = reducer.reduce(
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

  const answered: ICodeHudState = reducer.settle(asked, "r1");
  TestValidator.equals("cleared", answered.pending, undefined);
  TestValidator.equals("resumes working", answered.activity, "working");

  const wrong: ICodeHudState = reducer.settle(asked, "r2");
  TestValidator.equals("a foreign answer changes nothing", wrong, asked);

  const none: ICodeHudState = reducer.settle(opened, "r1");
  TestValidator.equals("answering nothing changes nothing", none, opened);

  Stream.reset();
  const asked2: ICodeHudState = reducer.reduce(
    reducer.reduce(reducer.initialize(), Stream.session()),
    Stream.permission("r9", "Delete build/"),
  );
  const ended: ICodeHudState = reducer.reduce(
    asked2,
    Stream.result("Nothing changed", "interrupted"),
  );
  TestValidator.equals("a result clears the request", ended.pending, undefined);
  TestValidator.equals("and ends the turn", ended.activity, "done");

  // The second answer, and everything that must not survive into another
  // request.
  const confirming: ICodeHudState = reducer.confirm(asked, "r1", true);
  TestValidator.equals(
    "a request can be moved to waiting for its second answer",
    confirming.confirming,
    true,
  );
  TestValidator.equals(
    "and is still pending, because nothing has been answered",
    confirming.pending?.request,
    "r1",
  );
  TestValidator.equals("still blocking, too", confirming.activity, "waiting");
  TestValidator.equals(
    "moving back leaves it waiting for a first answer",
    reducer.confirm(confirming, "r1", false).confirming,
    false,
  );
  TestValidator.equals(
    "confirming a request that is not the pending one changes nothing",
    reducer.confirm(confirming, "r2", false),
    confirming,
  );

  const next: ICodeHudState = reducer.reduce(
    confirming,
    Stream.permission("r2", "Delete node_modules"),
  );
  TestValidator.equals(
    "the new request is the pending one",
    next.pending?.request,
    "r2",
  );
  TestValidator.equals(
    "a new request is waiting for its own first answer",
    next.confirming,
    false,
  );
  TestValidator.equals(
    "answering clears it as well as the request",
    reducer.settle(confirming, "r1").confirming,
    false,
  );
  TestValidator.equals(
    "a result clears it",
    reducer.reduce(confirming, Stream.result("Stopped", "interrupted"))
      .confirming,
    false,
  );
  TestValidator.equals(
    "and so does a fault",
    reducer.reduce(confirming, Stream.error("the harness died", true))
      .confirming,
    false,
  );
}
