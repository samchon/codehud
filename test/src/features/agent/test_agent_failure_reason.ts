import { CodeHudHarnessProbe } from "@codehud/agent";
import { TestValidator } from "@nestia/e2e";

/**
 * A refusal reaching the display says something a wearer can act on.
 *
 * Whatever a rejection carried has to become one short line on a narrow
 * display. A wearer who cannot reach the host machine still has to learn why
 * they are stuck, and `[object Object]` tells them less than nothing.
 *
 * Scenarios:
 *
 * 1. An `Error` contributes its message, which is the ordinary case.
 * 2. A thrown string contributes itself, since a rejection crossing this
 *    boundary is not always an `Error`.
 * 3. Anything else yields a stated phrase rather than a coerced object, the
 *    negative twin that keeps a default toString from reaching a display.
 * 4. Null and undefined are that same case, reached the way a swallowed
 *    rejection usually reaches it.
 * 5. The message is taken without its stack, because the refusal has to fit a
 *    display and the full text belongs in the bridge's own log.
 */
export async function test_agent_failure_reason(): Promise<void> {
  const render = CodeHudHarnessProbe.reason;

  TestValidator.equals(
    "an Error contributes its message",
    render(new Error("EACCES: permission denied")),
    "EACCES: permission denied",
  );

  TestValidator.equals(
    "a thrown string contributes itself",
    render("PATH was unreadable"),
    "PATH was unreadable",
  );

  const stated: string = render({ code: "ENOENT" });
  TestValidator.equals(
    "an object yields a stated phrase",
    stated,
    "the reason was not reported",
  );
  TestValidator.equals(
    "and never a coerced one",
    stated.includes("object"),
    false,
  );

  TestValidator.equals(
    "null is the same case",
    render(null),
    "the reason was not reported",
  );
  TestValidator.equals(
    "and so is undefined",
    render(undefined),
    "the reason was not reported",
  );

  const deep: Error = new Error("the message only");
  TestValidator.equals(
    "the stack does not come along",
    render(deep).includes("at "),
    false,
  );
}
