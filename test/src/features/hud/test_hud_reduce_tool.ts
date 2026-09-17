import type { ICodeHudState } from "@codehud/interface";
import { CodeHudContext, CodeHudReducer } from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

import { Stream } from "../internal/stream";

/**
 * Every phase of one tool invocation collapses onto one history entry.
 *
 * A wearer cares that a file was edited, not that editing it had a start, an
 * update, and a finish. Three entries for one call would push the things they
 * actually review out of a bounded history.
 *
 * Scenarios:
 *
 * 1. A start records one unfinished entry.
 * 2. An update for the same call replaces it in place rather than prepending,
 *    which is the upsert arm keyed by call identifier.
 * 3. A finish marks it done without adding an entry.
 * 4. A different call identifier does prepend, the negative twin that proves
 *    scenario 2 is matching on identity rather than collapsing everything.
 * 5. A failed finish records the failure, so the composer can escalate it.
 * 6. The newest entry is first, since that is the order review walks.
 */
export async function test_hud_reduce_tool(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  Stream.reset();
  let state: ICodeHudState = reducer.initialize();

  state = reducer.reduce(state, Stream.tool("c1", "Edit a.ts", "start"));
  TestValidator.equals("start records one", state.history.length, 1);
  TestValidator.equals("start sets working", state.activity, "working");
  TestValidator.equals("start is unfinished", state.history[0]!.done, false);

  state = reducer.reduce(
    state,
    Stream.tool("c1", "Edit a.ts (2 of 5)", "update"),
  );
  TestValidator.equals("update does not add", state.history.length, 1);
  TestValidator.equals(
    "update replaces in place",
    state.history[0]!.title,
    "Edit a.ts (2 of 5)",
  );
  TestValidator.equals(
    "update is still unfinished",
    state.history[0]!.done,
    false,
  );

  state = reducer.reduce(
    state,
    Stream.tool("c1", "Edit a.ts", "finish", false),
  );
  TestValidator.equals("finish does not add", state.history.length, 1);
  TestValidator.equals("finish marks done", state.history[0]!.done, true);
  TestValidator.equals("finish did not fail", state.history[0]!.failed, false);

  state = reducer.reduce(state, Stream.tool("c2", "Bash pnpm test", "start"));
  TestValidator.equals("a second call adds", state.history.length, 2);
  TestValidator.equals(
    "newest is first",
    state.history[0]!.title,
    "Bash pnpm test",
  );
  TestValidator.equals("older survives", state.history[1]!.title, "Edit a.ts");

  state = reducer.reduce(
    state,
    Stream.tool("c2", "Bash pnpm test", "finish", true),
  );
  TestValidator.equals("failure is recorded", state.history[0]!.failed, true);
  TestValidator.equals("failure still finishes", state.history[0]!.done, true);
  TestValidator.equals("failure does not add", state.history.length, 2);
}
