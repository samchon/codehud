import {
  CodeHudClaudeSession,
  type ICodeHudHarnessChannel,
} from "@codehud/agent";
import type { ICodeHudAgentEvent } from "@codehud/interface";

import { Assert } from "../internal/assert";
import { Claude } from "../internal/claude";

/**
 * An answer reaches the harness only when the harness is waiting for it.
 *
 * The specification is blunt about this: an answer quoting no identifier, or
 * one the system does not recognize, is refused and applied to nothing. The
 * reason is not tidiness. The harness discards an answer it is not waiting on
 * without complaint, so a session that forwarded one hopefully would report
 * success to a wearer whose decision never landed, and the agent would sit
 * blocked on a question they believe they answered.
 *
 * Driven through captured `can_use_tool` requests rather than invented ones, so
 * the identifier being paired is a real one in its real position.
 *
 * Scenarios:
 *
 * 1. An answer quoting the identifier the harness asked under is written, as a
 *    control response naming that identifier and the behaviour chosen.
 * 2. Allow and deny are distinguished by the option's declared affirmative
 *    property, never by reading its label.
 * 3. An answer quoting an unknown identifier is refused, and nothing is written.
 * 4. The same answer twice is refused the second time, because the harness is
 *    no longer waiting: an approval is answered once.
 * 5. A prompt is written whether or not anything is pending, since an
 *    instruction is not an answer.
 * 6. The terminal line clears what was pending, so an answer arriving after the
 *    turn ended is refused rather than written into the next one.
 * 7. Closing is idempotent and reaches the channel once; sending afterwards is
 *    refused rather than silently dropped.
 * 8. An answer naming a word this harness does not offer is refused *and
 *    consumes nothing*: the request stays pending and the wearer's next answer,
 *    the correct one, still lands. The specification requires a refused answer
 *    to apply to nothing, and the record of what is pending is part of what it
 *    would otherwise apply to.
 */
export async function test_agent_claude_pairing(): Promise<void> {
  class Channel implements ICodeHudHarnessChannel {
    public readonly written: unknown[] = [];
    public closed: number = 0;
    public constructor(private readonly feed: Claude.IEnvelope[]) {}
    public get lines(): AsyncIterable<unknown> {
      const feed: Claude.IEnvelope[] = this.feed;
      return {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<unknown> {
          for (const line of feed)
            if (line.__direction !== "host->harness") yield line;
        },
      };
    }
    public async write(value: unknown): Promise<void> {
      this.written.push(value);
    }
    public async close(): Promise<void> {
      this.closed += 1;
    }
  }

  const drain = async (
    stream: Claude.IEnvelope[],
  ): Promise<{
    session: CodeHudClaudeSession;
    channel: Channel;
    events: ICodeHudAgentEvent[];
  }> => {
    const channel: Channel = new Channel(stream);
    const session: CodeHudClaudeSession = new CodeHudClaudeSession(
      "s1",
      channel,
      { now: () => 0 },
    );
    const events: ICodeHudAgentEvent[] = [];
    for await (const event of session.events) {
      events.push(event);
      // Stop before the terminal line, so the approval is still pending.
      if (event.type === "permission") break;
    }
    return { session, channel, events };
  };

  const asked: string =
    Claude.APPROVE.find((line) => line.request?.subtype === "can_use_tool")
      ?.request_id ?? "";
  Assert.predicate("a real request was captured", asked.length > 0);

  const allowed = await drain(Claude.APPROVE);
  await allowed.session.send({
    type: "decision",
    request: asked,
    option: "allow",
  });
  Assert.equals(
    "answering what was asked writes one line",
    allowed.channel.written.length,
    1,
  );
  Assert.equals(
    "naming the identifier and the behaviour",
    allowed.channel.written[0],
    {
      type: "control_response",
      response: {
        subtype: "success",
        request_id: asked,
        response: { behavior: "allow" },
      },
    },
  );

  const refused = await drain(Claude.APPROVE);
  await refused.session.send({
    type: "decision",
    request: asked,
    option: "deny",
  });
  Assert.equals(
    "a negative option denies",
    (
      refused.channel.written[0] as {
        response: { response: { behavior: string } };
      }
    ).response.response.behavior,
    "deny",
  );

  const unknown = await drain(Claude.APPROVE);
  await Assert.throws("an unrecognized identifier is refused", () =>
    unknown.session.send({
      type: "decision",
      request: "toolu_nobody_asked",
      option: "allow",
    }),
  );
  Assert.equals("and nothing is written", unknown.channel.written.length, 0);

  const twice = await drain(Claude.APPROVE);
  await twice.session.send({
    type: "decision",
    request: asked,
    option: "allow",
  });
  await Assert.throws("the same approval is not answered twice", () =>
    twice.session.send({ type: "decision", request: asked, option: "deny" }),
  );
  Assert.equals(
    "so only the first answer was written",
    twice.channel.written.length,
    1,
  );

  // A word this harness does not offer, and what it must leave behind.
  const mistaken = await drain(Claude.APPROVE);
  await Assert.throws("a word this harness does not offer is refused", () =>
    mistaken.session.send({
      type: "decision",
      request: asked,
      option: "approved",
    }),
  );
  Assert.equals("and nothing was written", mistaken.channel.written.length, 0);
  await mistaken.session.send({
    type: "decision",
    request: asked,
    option: "allow",
  });
  Assert.equals(
    "the request was still pending, so the correct answer lands",
    mistaken.channel.written.length,
    1,
  );

  const prompting = await drain(Claude.APPROVE);
  await prompting.session.send({ type: "prompt", text: "keep going" });
  Assert.equals(
    "an instruction is not an answer and is always written",
    prompting.channel.written[0],
    { type: "user", message: { role: "user", content: "keep going" } },
  );

  // Drained to the end this time, so the terminal line has cleared the pending
  // approval the way it does when a turn finishes on its own.
  const finished: Channel = new Channel(Claude.APPROVE);
  const session: CodeHudClaudeSession = new CodeHudClaudeSession(
    "s1",
    finished,
    { now: () => 0 },
  );
  for await (const _ of session.events) void _;
  await Assert.throws("an answer after the turn ended is refused", () =>
    session.send({ type: "decision", request: asked, option: "allow" }),
  );
  Assert.equals("and is not written", finished.written.length, 0);

  await session.close();
  await session.close();
  Assert.equals("closing twice reaches the channel once", finished.closed, 1);
  await Assert.throws("and sending afterwards is refused", () =>
    session.send({ type: "prompt", text: "too late" }),
  );
}
