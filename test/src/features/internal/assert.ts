// The one import of this name in the package. `test/lint.config.ts` restricts
// it everywhere else and names this file in its `ignores`, which refines that
// entry's own rule rather than excusing the file from the workspace's —
// checked, not assumed.
import { TestValidator } from "@nestia/e2e";

/**
 * Every assertion this suite makes, and why it is not `TestValidator` directly.
 *
 * `@nestia/e2e` is written for suites that compare a server's response against
 * part of it. This one compares a pure function's whole output against what it
 * should be, and two of its assertions are wrong for that job in the direction
 * that keeps a case green. So the suite asserts through here instead, and the
 * cases never import `TestValidator` — not because the library is at fault, but
 * because an assertion that cannot be made to fail is the one thing this
 * repository will not keep, and the only way to know that of six hundred
 * assertions is for them all to come through one door.
 *
 * What was measured before this existed, by instrumenting the suite rather than
 * reading it: 899 equality assertions, 216 of them over structures, **none**
 * wrong today, and 18 refusal assertions, **none** synchronous. Both traps were
 * real and neither was sprung. That is the whole argument for doing it this way
 * — there was nothing to repair, and a door is cheaper than remembering.
 *
 * {@link predicate} is re-exported unchanged. It was read and it is sound.
 *
 * ## The refusal assertion
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
   * Asserts a condition, unchanged from the library.
   *
   * Re-exported rather than wrapped. Its three branches were read and each is
   * sound: a boolean is compared, a closure's boolean result is compared, and a
   * promised one is awaited. It is here so that a case has one place to import
   * its assertions from, which is what makes the other two enforceable.
   */
  export const predicate = TestValidator.predicate;

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

  /**
   * The equality assertion this suite uses, and why it is not the obvious one.
   *
   * `TestValidator.equals` is asymmetric. A member the expected value declares
   * and the actual one does not have — absent, or present and `undefined` — is
   * accepted, at any depth:
   *
   * ```js
   * TestValidator.equals("t", { a: 1 }, { a: 1, b: "y" });            // passes
   * TestValidator.equals("t", { a: 1, b: undefined }, { a: 1, b: "y" }); // passes
   * TestValidator.equals("t", { a: 1, b: "y" }, { a: 1 });            // throws
   * ```
   *
   * That is the right default for a suite comparing a server's response
   * against a subset of it, and the wrong one here: every case in this suite
   * compares a pure function's whole output against what it should be, and the
   * members most worth asserting are the optional ones — a `detail` line, a
   * `failed` flag, an `action` class — which are exactly the ones a function
   * that stopped producing them would still be reported as producing.
   *
   * Found by mutating a working assertion and watching it stay green: a
   * normalizer changed to drop the reason it puts under an approval's title
   * passed a case that named the reason it expected. Scalars are unaffected,
   * and so is an array's length; what needs this is any comparison whose
   * values contain an object, however deeply it is wrapped — an array of them
   * hides a missing member exactly the way a bare one does.
   *
   * Asserted in both directions rather than reimplemented. The second call is
   * the one that catches a member missing from the actual value, because in
   * that direction it is missing from the *expected* one, which is the
   * direction `TestValidator.equals` already reports.
   */
  export const equals = <T>(title: string, actual: T, expected: T): void => {
    TestValidator.equals(title, actual as never, expected as never);
    TestValidator.equals(title, expected as never, actual as never);
  };

  /**
   * Whether {@link equals} would itself report a value missing a member.
   *
   * Exists for the same reason as {@link reports}: the wrapper is armed by a
   * case rather than trusted, and the caller cannot use the assertion to test
   * the assertion. Returns what happened instead of asserting it.
   */
  /** Whether a task completed without throwing. */
  const quiet = (task: () => void): boolean => {
    try {
      task();
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Asserts that two values are not equal, symmetrically.
   *
   * `TestValidator.notEquals` is the same comparison negated, so it carries the
   * mirror image of the weakness {@link equals} works around: it walks the
   * first operand's keys, and a difference that exists only as a member the
   * first operand does not have is a difference it cannot see. Asserted as "at
   * least one direction found something", which is what "not equal" means.
   */
  export const differs = <T>(title: string, actual: T, expected: T): void => {
    const one: boolean = quiet(() =>
      TestValidator.notEquals(title, actual as never, expected as never),
    );
    const other: boolean = quiet(() =>
      TestValidator.notEquals(title, expected as never, actual as never),
    );
    if (one === false && other === false)
      throw new Error(`Bug on ${title}: the two values are equal.`);
  };

  export const compares = (actual: unknown, expected: unknown): boolean => {
    try {
      equals("a value that was supposed to differ", actual, expected);
      return false;
    } catch {
      return true;
    }
  };
}
