import {
  CodeHudClaudeSession,
  CodeHudCodexSession,
  type ICodeHudHarnessChannel,
} from "@codehud/agent";
import { TestValidator } from "@nestia/e2e";

import { Assert } from "../internal/assert";

/**
 * A photograph the wearer attached reaches the harness.
 *
 * The camera is the one input a desktop terminal cannot match — a screen, a
 * whiteboard, a broken fixture becomes part of the prompt — and the contract has
 * carried `images` on a prompt since it was written, citing exactly that. Both
 * adapters dropped them: the Claude session sent `content: command.text` and the
 * Codex session sent one text input, and neither said so. A wearer would have
 * photographed something, spoken about it, and been answered about a picture the
 * agent never saw.
 *
 * The two harnesses take images in different shapes, and both shapes are read
 * from the vendor rather than assumed. Codex's is in its own generated
 * bindings — `UserInput` admits `{ type: "image", url }`, a URL rather than a
 * payload, so a data URL goes in whole. Claude Code's is in the installed
 * binary, which carries both the block shape and the branch that accepts a
 * message whose content is an array instead of a string:
 *
 * ```text
 * {type:"image",data:w.source.data,mimeType:"media_type" in w.source ? …}
 * typeof Ae === "string" ? re(Ae, v) : Array.isArray(Ae) ? uFe(Ae, v, M) : ""
 * ```
 *
 * Scenarios:
 *
 * 1. A prompt with no images is still a plain string on the Claude side, which
 *    is what every other client sends and what its captures show. Attaching an
 *    array unconditionally would change the shape of every ordinary turn.
 * 2. A prompt with images becomes text plus one block each, in the vendor's
 *    base64 shape, with the media type taken from the data URL rather than
 *    guessed.
 * 3. Codex is handed the data URL whole, because its input takes a URL.
 * 4. A malformed data URL is refused rather than sent. A photograph that
 *    arrived broken is a defect in the device that took it, and sending it as
 *    text would answer the wearer about a picture nobody saw.
 */
export async function test_agent_attached_images(): Promise<void> {
  const png: string =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const jpeg: string = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==";

  // 1-2. What the Claude session's message carries.
  TestValidator.equals(
    "a prompt with nothing attached is a plain string",
    CodeHudClaudeSession.content({ type: "prompt", text: "look at this" }),
    "look at this",
  );
  TestValidator.equals(
    "and one with a photograph is the text and a block for it",
    CodeHudClaudeSession.content({
      type: "prompt",
      text: "what is wrong here",
      images: [png],
    }),
    [
      { type: "text", text: "what is wrong here" },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: png.slice(png.indexOf(",") + 1),
        },
      },
    ],
  );
  TestValidator.equals(
    "with the media type read from each URL rather than assumed",
    (
      CodeHudClaudeSession.content({
        type: "prompt",
        text: "two of them",
        images: [png, jpeg],
      }) as CodeHudClaudeSession.IBlock[]
    ).map((block) =>
      block.type === "image" ? block.source.media_type : block.type,
    ),
    ["text", "image/png", "image/jpeg"],
  );

  // 3. What the Codex session puts on the wire, over a real session object.
  class Channel implements ICodeHudHarnessChannel {
    public readonly written: Record<string, unknown>[] = [];
    public get lines(): AsyncIterable<unknown> {
      return {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<unknown> {
          // Nothing: this case is about what the client says.
        },
      };
    }
    public async write(value: unknown): Promise<void> {
      this.written.push(value as Record<string, unknown>);
    }
    public async close(): Promise<void> {}
  }
  const channel: Channel = new Channel();
  const session: CodeHudCodexSession = new CodeHudCodexSession("s1", channel, {
    thread: "t",
    directory: "/repo",
    now: () => 0,
  });
  await session.send({
    type: "prompt",
    text: "what is wrong here",
    images: [png, jpeg],
  });
  TestValidator.equals(
    "Codex is handed the data URLs whole, because its input takes a URL",
    (channel.written[0] as { params: { input: unknown[] } }).params.input,
    [
      { type: "text", text: "what is wrong here", text_elements: [] },
      { type: "image", url: png },
      { type: "image", url: jpeg },
    ],
  );

  // 4. What a broken one does.
  for (const broken of [
    "https://example.com/photo.png",
    "data:image/png,notbase64",
    "data:;base64,AAAA",
    "",
  ])
    await Assert.throws(`${broken || "an empty string"} is refused`, () =>
      CodeHudClaudeSession.image(broken),
    );
}
