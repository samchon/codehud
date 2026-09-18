import type { ICodeHudState } from "@codehud/interface";
import { CodeHudContext, CodeHudReducer } from "@codehud/projection";

import { Assert } from "../internal/assert";
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
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  Stream.reset();
  let state: ICodeHudState = reducer.initialize();

  for (let i = 0; i < CodeHudContext.DEFAULT.history - 1; ++i)
    state = reducer.reduce(
      state,
      Stream.tool(`c${i}`, `Edit ${i}.ts`, "finish", false),
    );
  Assert.equals(
    "below the cap",
    state.history.length,
    CodeHudContext.DEFAULT.history - 1,
  );

  state = reducer.reduce(
    state,
    Stream.tool("edge", "Edit edge.ts", "finish", false),
  );
  Assert.equals(
    "exactly at the cap",
    state.history.length,
    CodeHudContext.DEFAULT.history,
  );

  state = reducer.reduce(
    state,
    Stream.tool("over", "Edit over.ts", "finish", false),
  );
  Assert.equals(
    "held at the cap",
    state.history.length,
    CodeHudContext.DEFAULT.history,
  );
  Assert.equals("newest survives", state.history[0]!.title, "Edit over.ts");
  Assert.equals(
    "oldest is gone",
    state.history.some((e) => e.title === "Edit 0.ts"),
    false,
  );

  const before: number = state.history.length;
  for (let i = 0; i < 10; ++i)
    state = reducer.reduce(
      state,
      Stream.tool("over", `Edit over.ts (${i})`, "update"),
    );
  Assert.equals("upserts never evict", state.history.length, before);
  Assert.equals(
    "and still update in place",
    state.history[0]!.title,
    "Edit over.ts (9)",
  );
}
