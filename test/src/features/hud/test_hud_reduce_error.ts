import type { ICodeHudState } from "@codehud/interface";
import { CodeHudReducer } from "@codehud/projection";
import { TestValidator } from "@nestia/e2e";

import { Stream } from "../internal/stream";

/**
 * A fatal error ends the session; a non-fatal one does not.
 *
 * The distinction decides whether the display may keep looking alive. A dead
 * session that renders as idle is indistinguishable from a thinking agent, and
 * a wearer will wait for it indefinitely.
 *
 * Scenarios:
 *
 * 1. A fatal error sets fault and holds the message for display.
 * 2. It clears a pending request, since nothing will answer it now.
 * 3. A non-fatal error advances the counter and changes nothing else, the
 *    negative twin. Without it, scenario 1 could pass on an implementation that
 *    treated every error as fatal.
 * 4. A non-fatal error after a fatal one does not revive the session, since the
 *    counter still advances but the fault stands.
 */
export async function test_hud_reduce_error(): Promise<void> {
  Stream.reset();
  const asked: ICodeHudState = CodeHudReducer.reduce(
    CodeHudReducer.reduce(CodeHudReducer.initialize(), Stream.session()),
    Stream.permission("r1", "Write src/index.ts"),
  );

  const dead: ICodeHudState = CodeHudReducer.reduce(
    asked,
    Stream.error("claude exited with code 1", true),
  );
  TestValidator.equals("fault", dead.activity, "fault");
  TestValidator.equals("message held", dead.fault, "claude exited with code 1");
  TestValidator.equals("pending cleared", dead.pending, undefined);

  const noisy: ICodeHudState = CodeHudReducer.reduce(
    asked,
    Stream.error("tool retried", false),
  );
  TestValidator.equals("non-fatal keeps waiting", noisy.activity, "waiting");
  TestValidator.equals(
    "non-fatal keeps the request",
    noisy.pending?.request,
    "r1",
  );
  TestValidator.equals("non-fatal sets no fault", noisy.fault, undefined);
  TestValidator.predicate(
    "non-fatal still advances the counter",
    noisy.sequence > asked.sequence,
  );

  const after: ICodeHudState = CodeHudReducer.reduce(
    dead,
    Stream.error("still noisy", false),
  );
  TestValidator.equals("a fault is not revived", after.activity, "fault");
  TestValidator.equals("and its message stands", after.fault, dead.fault);
}
