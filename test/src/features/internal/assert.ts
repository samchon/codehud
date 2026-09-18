import { TestValidator } from "@nestia/e2e";

/**
 * The refusal assertion this suite uses, and why it is not the obvious one.
 *
 * `TestValidator.error` does the right thing for a task that returns a promise
 * and the wrong thing for one that does not. Its synchronous branch raises the
 * failure inside the same `try` that is about to swallow it:
 *
 * ```js
 * try {
 *   const output = task();
 *   if (is_promise(output)) return new Promise(…);   // correct
 *   else throw new Error(message());                 // "it did not throw"
 * } catch { return undefined; }                      // …caught here
 * ```
 *
 * So a synchronous function that fails to refuse is reported as having refused.
 * Every such assertion in a suite is green whatever the code does, which is the
 * one thing this repository will not keep: a check is not a check until it has
 * been made to fail, and that one cannot be.
 *
 * Observed against `@nestia/e2e` as installed. The wrapper does not patch it —
 * it hands the task over as a promise, which is the branch that works — so a
 * later release fixing the synchronous branch changes nothing here.
 */
export namespace Assert {
  /**
   * Asserts that a task refuses, whether or not it is asynchronous.
   *
   * Always awaited by the caller. The point of the wrapper is that the task
   * becomes a promise before `TestValidator.error` sees it, so a synchronous
   * throw is reported through the branch that reports correctly.
   */
  export const throws = async (
    title: string,
    task: () => unknown,
  ): Promise<void> => {
    await TestValidator.error(title, async (): Promise<void> => {
      // Awaited, not merely called. The first version dropped whatever the task
      // returned, so a task that refused *asynchronously* had its rejection
      // escape as an unhandled one — which does not fail a case, it takes the
      // whole runner down, and it took a while to see that the crash and the
      // silence were the same mistake.
      await task();
    });
  };

  /**
   * Whether {@link throws} would itself report a task that did not refuse.
   *
   * Exists so the wrapper is armed by a case rather than trusted. It returns
   * what happened instead of asserting it, because the caller is testing the
   * assertion and cannot use the assertion to do so. Worth passing an
   * asynchronous task as well as a synchronous one: those are two branches of
   * the thing being tested, and each has been wrong once.
   */
  export const reports = async (task: () => unknown): Promise<boolean> =>
    throws("a task that was supposed to refuse", task)
      .then((): boolean => false)
      .catch((): boolean => true);
}
