import { CodeHudDeskCommand } from "@codehud/simulator";
import { TestValidator } from "@nestia/e2e";

/**
 * Nothing a wearer says while the host is busy is dropped.
 *
 * Recognition arrives as a callback and the device adapter reads an iterable,
 * and something has to hold what arrives while nobody is waiting. On a surface
 * whose only instruction channel is speech, a dropped utterance is a wearer
 * repeating themselves into a session that heard them perfectly well — and if
 * the dropped one was an approval answer, repeating it is the second time they
 * have authorized something they meant to authorize once.
 *
 * The two orders are separate cases because they exercise opposite halves: one
 * where the value arrives first and the reader takes it immediately, and one
 * where the reader is already parked on a promise nothing has resolved.
 *
 * Scenarios:
 *
 * 1. Lines offered before anything reads them are held, in order.
 * 2. A reader already waiting is handed the next line as it arrives.
 * 3. Ending the stream ends the iteration rather than hanging it, which is what
 *    lets the host's run resolve when the wearer stops talking.
 * 4. A reader parked when the stream ends is released rather than left waiting.
 * 5. Lines offered after the end are refused, so a stream cannot come back.
 */
export async function test_device_desk_input(): Promise<void> {
  // 1. Held while nobody is reading.
  const early: CodeHudDeskCommand.ILines = CodeHudDeskCommand.queue();
  early.push("first");
  early.push("second");
  const read: string[] = [];
  const iterator: AsyncIterator<string> = early.inputs[Symbol.asyncIterator]();
  read.push(((await iterator.next()) as IteratorYieldResult<string>).value);
  read.push(((await iterator.next()) as IteratorYieldResult<string>).value);
  TestValidator.equals("both were held, in order", read, ["first", "second"]);

  // 2. Handed over while already waiting.
  const parked: Promise<IteratorResult<string>> = iterator.next();
  early.push("third");
  TestValidator.equals(
    "a waiting reader is handed the next line",
    ((await parked) as IteratorYieldResult<string>).value,
    "third",
  );

  // 3. Ending ends the iteration.
  early.end();
  TestValidator.equals(
    "and ending finishes it rather than hanging",
    (await iterator.next()).done,
    true,
  );

  // 4. A reader parked when the end arrives.
  const late: CodeHudDeskCommand.ILines = CodeHudDeskCommand.queue();
  const reader: AsyncIterator<string> = late.inputs[Symbol.asyncIterator]();
  const waiting: Promise<IteratorResult<string>> = reader.next();
  late.end();
  TestValidator.equals(
    "a reader parked at the end is released",
    (await waiting).done,
    true,
  );

  // 5. Nothing arrives after the end.
  late.push("too late");
  TestValidator.equals(
    "and the stream does not come back",
    (await reader.next()).done,
    true,
  );
}
