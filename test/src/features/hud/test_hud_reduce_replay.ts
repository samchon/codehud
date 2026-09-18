import type { ICodeHudAgentEvent, ICodeHudState } from "@codehud/interface";
import { CodeHudContext, CodeHudReducer } from "@codehud/projection";

import { Assert } from "../internal/assert";
import { Stream } from "../internal/stream";

/**
 * Folding a stream twice lands exactly where folding it once did.
 *
 * This is the property that makes reconnection safe. A returning device asks
 * for everything after the counter it holds, and the bridge may resend more
 * than it needed; if the fold were not idempotent, the wearer would see
 * duplicated history and a rewound display.
 *
 * Scenarios:
 *
 * 1. A fresh state starts before every observation, so an observation numbered
 *    zero is still ahead of it.
 * 2. Folding a stream once produces the expected terminal state.
 * 3. Folding the same stream twice produces the identical state, which is the
 *    convergence property stated in the specification.
 * 4. An observation at or below the highest already folded is discarded, so a
 *    late arrival cannot rewind the display. This is the negative twin: without
 *    it, scenario 3 could pass by accident on a stream with no repeats.
 * 5. An observation exactly at the highest folded counter is discarded too,
 *    the boundary between "already seen" and "new".
 */
export async function test_hud_reduce_replay(): Promise<void> {
  const reducer: CodeHudReducer = new CodeHudReducer(CodeHudContext.DEFAULT);
  Stream.reset();
  const events: ICodeHudAgentEvent[] = [
    Stream.session(),
    Stream.tool("c1", "Read src/index.ts", "start"),
    Stream.tool("c1", "Read src/index.ts", "finish", false),
    Stream.message("The reducer ", false),
    Stream.message("is pure.", true),
    Stream.result("Read one file", "success"),
  ];

  const fresh: ICodeHudState = reducer.initialize();
  Assert.equals("starts before everything", fresh.sequence, -1);
  Assert.equals("starts connecting", fresh.activity, "connecting");

  const once: ICodeHudState = events.reduce(
    (acc, e) => reducer.reduce(acc, e),
    fresh,
  );
  Assert.equals("activity", once.activity, "done");
  Assert.equals("sequence", once.sequence, 5);
  Assert.equals("message cleared by the result", once.message, "");

  const twice: ICodeHudState = [...events, ...events].reduce(
    (acc, e) => reducer.reduce(acc, e),
    fresh,
  );
  Assert.equals("replay converges", twice, once);

  const rewound: ICodeHudState = reducer.reduce(once, events[1]!);
  Assert.equals("a stale observation is discarded", rewound, once);

  const sameCounter: ICodeHudAgentEvent = { ...Stream.session(), sequence: 5 };
  Assert.equals(
    "an observation at the held counter is discarded",
    reducer.reduce(once, sameCounter),
    once,
  );
}
