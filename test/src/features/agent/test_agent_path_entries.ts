import { CodeHudNodeRunner } from "@codehud/agent";
import { TestValidator } from "@nestia/e2e";

/**
 * Path entries are unwrapped before anything is looked for inside them.
 *
 * Windows admits quoted entries and a great many machines have at least one,
 * because an installer that wrote a path containing a space quoted it. Joining
 * a quoted entry produces a path that cannot exist, so a harness living inside
 * it would be reported absent: the same wrong answer as a missing install, for
 * a reason the wearer could do nothing about.
 *
 * The separator is passed explicitly. It differs between operating systems, and
 * this suite runs on Linux in continuous integration, so a case written with
 * the running platform's separator would stop exercising the other one.
 *
 * Scenarios:
 *
 * 1. A quoted entry is unwrapped, including one containing a space, which is
 *    the reason entries get quoted in the first place.
 * 2. An unquoted entry is untouched, the negative twin. Without it, an
 *    implementation that stripped the first and last character of everything
 *    would pass scenario 1.
 * 3. An empty entry is dropped rather than resolving to the working directory.
 *    A trailing separator is common, and looking for a harness in wherever the
 *    bridge happened to be started is not something to do by accident.
 * 4. Surrounding space is trimmed, since a hand-edited path variable collects
 *    it.
 * 5. An empty path yields no directories rather than one empty one.
 * 6. A quote in the middle of an entry is left alone, because only a wrapped
 *    entry is a quoted entry.
 */
export async function test_agent_path_entries(): Promise<void> {
  const split = (path: string): string[] =>
    CodeHudNodeRunner.directories(path, ";");

  TestValidator.equals(
    "a quoted entry is unwrapped",
    split(String.raw`C:\a;"C:\Program Files\b";C:\c`),
    [String.raw`C:\a`, String.raw`C:\Program Files\b`, String.raw`C:\c`],
  );

  TestValidator.equals(
    "an unquoted entry is untouched",
    split(String.raw`C:\only`),
    [String.raw`C:\only`],
  );

  TestValidator.equals(
    "an empty entry is dropped rather than meaning the working directory",
    split(String.raw`C:\a;;C:\b;`),
    [String.raw`C:\a`, String.raw`C:\b`],
  );

  TestValidator.equals(
    "surrounding space is trimmed",
    split(String.raw`  C:\a  ; C:\b `),
    [String.raw`C:\a`, String.raw`C:\b`],
  );

  TestValidator.equals("an empty path yields nothing", split(""), []);
  TestValidator.equals("a path of separators yields nothing", split(";;;"), []);

  TestValidator.equals(
    "a quote inside an entry is not a wrapper",
    split(String.raw`C:\od"d`),
    [String.raw`C:\od"d`],
  );
}
