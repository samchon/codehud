import denied from "./fixtures/claude-code/denied.json";
import hosted from "./fixtures/claude-code/hosted.json";
import partial from "./fixtures/claude-code/partial.json";
import plain from "./fixtures/claude-code/plain.json";
import tool from "./fixtures/claude-code/tool.json";

/**
 * What `claude --output-format stream-json` actually emitted, captured from runs.
 *
 * Claude Code ships no protocol binding generator, unlike Codex. That asymmetry
 * is why these exist: the Codex adapter can be compiled against generated types,
 * and the Claude Code adapter has to be written against what a real invocation
 * produced and recaptured when the version moves.
 *
 * Captured from `claude 2.1.274` on Windows, in a throwaway directory holding
 * one file, with these invocations:
 *
 * ```text
 * plain    --print --output-format stream-json --verbose --permission-mode manual
 *          --permission-prompts none "Reply with exactly the word: pong"
 * tool     ... same, "Read notes.txt and reply with only its second line."
 * denied   ... same, "Create a file called out.txt containing the word hello."
 * partial  ... same plus --include-partial-messages,
 *          "Count from one to five in words, one per line."
 * hosted   --print --output-format stream-json --verbose --permission-mode manual
 *          (no --permission-prompts at all, so the default "host"),
 *          "Create a file called host.txt containing the word hello."
 * ```
 *
 * `hosted` is the one that changed a design assumption. With `--permission-prompts`
 * left at its default, the harness is supposed to ask whoever is hosting it. A
 * bridge that spawns the binary as an ordinary subprocess is not an SDK host, and
 * what happens then was measured rather than guessed: the write was **denied
 * automatically**, exactly as under `--permission-prompts none`. It did not hang
 * and it did not error. So an approval a wearer could answer cannot be obtained
 * from the plain command line as it stands, and the help text points at
 * `--permission-prompt-tool`, which 2.1.274 does not list among its options.
 *
 * A fifth run used `--allowedTools=Read` instead of `--permission-prompts none`
 * for the same reading prompt, and produced an identical envelope sequence, so
 * it is not kept. Two things were learned from it anyway: `Read` is not gated
 * under `--permission-mode manual`, and `--allowedTools` is variadic, so
 * `--allowedTools Read "the prompt"` swallows the prompt as a second tool name
 * and the run dies with "Input must be provided". The `=` form is the safe one.
 *
 * **Scrubbed, deliberately.** Every field name and type is as captured, but
 * identifiers are renumbered, durations and token counts are zeroed, and the
 * values that were this machine's or this account's are replaced: the working
 * directory, the memory path, the messaging socket, the installed tool, skill
 * and command lists, the connected MCP servers, and the rate-limit utilization.
 * Replaced rather than deleted, so the envelope still carries every field an
 * adapter will meet.
 */
export namespace Claude {
  /**
   * One line of the stream, as far as anything here needs to know.
   *
   * Deliberately loose. These are captures of a vendor's output, not a contract
   * this repository owns, and typing them tightly would state as a promise
   * something only a rerun can confirm. The adapter will narrow them; this is
   * the shape needed to inventory and walk them.
   */
  export interface IEnvelope {
    /** Line kind: `system`, `assistant`, `user`, `result`, and the rest. */
    type: string;

    /** Finer kind, where the line has one. */
    subtype?: string;

    /** Conversation the line belongs to. */
    session_id?: string;

    /** The Anthropic message, on `assistant` and `user` lines. */
    message?: {
      content?: { type: string; text?: string; is_error?: boolean }[];
    };

    /** The raw streaming event, on `stream_event` lines. */
    event?: {
      type: string;
      delta?: { type?: string; text?: string };
    };

    /** The final text, on a `result` line. */
    result?: string;

    /** What the session refused to do, on a `result` line. */
    permission_denials?: { tool_name: string; tool_use_id: string }[];
  }

  /** A turn with no tool call: the shortest stream the harness produces. */
  export const PLAIN: IEnvelope[] = plain as unknown as IEnvelope[];

  /** A turn that read a file: one tool call, allowed, with its result. */
  export const TOOL: IEnvelope[] = tool as unknown as IEnvelope[];

  /** A turn whose write was refused, which is the approval gate's evidence. */
  export const DENIED: IEnvelope[] = denied as unknown as IEnvelope[];

  /** A turn captured with `--include-partial-messages`. */
  export const PARTIAL: IEnvelope[] = partial as unknown as IEnvelope[];

  /**
   * The same refused write, with nobody hosting the prompt.
   *
   * Denied automatically rather than asked about, and it carries two line kinds
   * the other captures do not: `system/thinking_tokens`, and an `assistant`
   * message whose content block is `thinking` rather than text.
   */
  export const HOSTED: IEnvelope[] = hosted as unknown as IEnvelope[];

  /** Every capture, for the rules that hold across all of them. */
  export const ALL: readonly { name: string; stream: IEnvelope[] }[] =
    Object.freeze([
      { name: "plain", stream: PLAIN },
      { name: "tool", stream: TOOL },
      { name: "denied", stream: DENIED },
      { name: "partial", stream: PARTIAL },
      { name: "hosted", stream: HOSTED },
    ]);

  /**
   * Every line kind these captures contain.
   *
   * Written out rather than derived, because an adapter has to handle each one
   * and a recapture that introduces a new kind is exactly the event this list
   * exists to make visible. Four of them are not named anywhere in the issue
   * that asked for this capture: `rate_limit_event`, `system/permission_denied`,
   * `system/status`, and `system/thinking_tokens`.
   */
  export const KINDS: readonly string[] = Object.freeze([
    "assistant",
    "rate_limit_event",
    "result/success",
    "stream_event",
    "system/init",
    "system/permission_denied",
    "system/status",
    "system/thinking_tokens",
    "user",
  ]);

  /**
   * Every content block kind an `assistant` or `user` message carried.
   *
   * Listed for the same reason as {@link KINDS}: an adapter has to decide what
   * each one becomes on a display, and `thinking` in particular is not text a
   * wearer asked for.
   */
  export const BLOCKS: readonly string[] = Object.freeze([
    "text",
    "thinking",
    "tool_result",
    "tool_use",
  ]);

  /** The kind of one line, as {@link KINDS} spells it. */
  export const kind = (line: IEnvelope): string =>
    line.subtype === undefined ? line.type : `${line.type}/${line.subtype}`;
}
