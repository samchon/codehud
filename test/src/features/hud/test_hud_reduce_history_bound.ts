import type { ICodeHudState } from "@codehud/interface";
import { CodeHudReducer } from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

import { Stream } from "../internal/stream";

/**
 * History is bounded, and the bound drops the oldest rather than the newest.
 *
 * A long turn produces hundreds of entries while the display shows one, so the
 * cap bounds memory. Dropping from the wrong end would leave a wearer reviewing
 * the beginning of a turn they already watched.
 *
 * Scenarios:
 *
 * 1. Below the cap, every entry is retained.
 * 2. Exactly at the cap, every entry is still retained, the boundary.
 * 3. Past the cap, the length holds at the cap.
 * 4. The newest entry survives and the oldest is the one gone.
 * 5. The cap counts distinct entries rather than observations, so upserting one
 *    call many times never evicts anything.
 */
export async function test_hud_reduce_history_bound(): Promise<void> {
  Stream.reset();
  let state: ICodeHudState = CodeHudReducer.initialize();

  for (let i = 0; i < CodeHudReducer.HISTORY - 1; ++i)
    state = CodeHudReducer.reduce(
      state,
      Stream.tool(`c${i}`, `Edit ${i}.ts`, "finish", false),
    );
  TestValidator.equals(
    "below the cap",
    state.history.length,
    CodeHudReducer.HISTORY - 1,
  );

  state = CodeHudReducer.reduce(
    state,
    Stream.tool("edge", "Edit edge.ts", "finish", false),
  );
  TestValidator.equals(
    "exactly at the cap",
    state.history.length,
    CodeHudReducer.HISTORY,
  );

  state = CodeHudReducer.reduce(
    state,
    Stream.tool("over", "Edit over.ts", "finish", false),
  );
  TestValidator.equals(
    "held at the cap",
    state.history.length,
    CodeHudReducer.HISTORY,
  );
  TestValidator.equals(
    "newest survives",
    state.history[0]!.title,
    "Edit over.ts",
  );
  TestValidator.equals(
    "oldest is gone",
    state.history.some((e) => e.title === "Edit 0.ts"),
    false,
  );

  const before: number = state.history.length;
  for (let i = 0; i < 10; ++i)
    state = CodeHudReducer.reduce(
      state,
      Stream.tool("over", `Edit over.ts (${i})`, "update"),
    );
  TestValidator.equals("upserts never evict", state.history.length, before);
  TestValidator.equals(
    "and still update in place",
    state.history[0]!.title,
    "Edit over.ts (9)",
  );
}
