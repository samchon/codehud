import approve from "./fixtures/claude-code/approve.json";
import denied from "./fixtures/claude-code/denied.json";
import hosted from "./fixtures/claude-code/hosted.json";
import partial from "./fixtures/claude-code/partial.json";
import plain from "./fixtures/claude-code/plain.json";
import refuse from "./fixtures/claude-code/refuse.json";
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
 * approve  --print --input-format stream-json --output-format stream-json
 *          --verbose --permission-mode manual --permission-prompt-tool stdio,
 *          driven by a host that answers can_use_tool with allow
 * refuse   ... the same, answered with deny
 * ```
 *
 * `hosted` is the one that settled the product's central question, and it took
 * two attempts to read correctly. With `--permission-prompts` left at its
 * default of `host`, a bridge that spawns the binary as an ordinary subprocess
 * is not recognized as a host, and the gated write is denied automatically: no
 * hang, no error, nobody asked. Read alone, that says an approval a wearer could
 * answer is unobtainable from the command line, which is what this file said at
 * first and what was published on the strength of it.
 *
 * It is wrong. Three things together make the harness ask, and the missing one
 * was a flag value that `--help` does not list:
 *
 * ```text
 * --input-format stream-json          so the host can answer at all
 * --permission-prompt-tool stdio      the sentinel meaning "the host answers over stdio"
 * a control_request/initialize        sent before the first user message
 * ```
 *
 * The value came from the shipped binary, which passes exactly
 * `--permission-prompt-tool stdio` when an SDK caller supplies a `canUseTool`
 * callback. With all three, the harness sends `control_request/can_use_tool`
 * naming the tool and its input, waits, and honours the answer: `approve` ends
 * with the file written and no denials, `refuse` with an errored `tool_result`
 * and the tool listed on the terminal line.
 *
 * `hosted` is kept anyway. It is what a bridge that gets this wrong actually
 * sees, and the difference between it and `refuse` is the evidence that the
 * rest of this is not a guess.
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
    /**
     * Which way this line travelled, on the two bidirectional captures.
     *
     * Recorded by the capture rather than sent by either side: a control
     * exchange is only legible if you can tell the question from the answer.
     */
    __direction?: "harness->host" | "host->harness";

    /** Line kind: `system`, `assistant`, `user`, `result`, and the rest. */
    type: string;

    /** Finer kind, where the line has one. */
    subtype?: string;

    /** Conversation the line belongs to. */
    session_id?: string;

    /**
     * The Anthropic message, on `assistant` and `user` lines.
     *
     * The content is an array of blocks on everything the harness emits, and
     * may be a plain string on what a host sends in: the input format accepts
     * the shorthand even though the output never uses it. Anything walking
     * blocks has to check which it has.
     */
    message?: {
      content?: string | { type: string; text?: string; is_error?: boolean }[];
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

    /** Correlates a control exchange, on `control_request` lines. */
    request_id?: string;

    /** What the harness is asking its host, on `control_request` lines. */
    request?: {
      subtype: string;
      tool_name?: string;
      input?: Record<string, unknown>;
    };

    /** What either side answered, on `control_response` lines. */
    response?: {
      subtype: string;
      request_id?: string;
      response?: { behavior?: string };
    };
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

  /**
   * A gated write the host allowed, over the control protocol.
   *
   * The file was created. This is the interaction the product exists for, and
   * the proof that it is reachable from an ordinary subprocess.
   */
  export const APPROVE: IEnvelope[] = approve as unknown as IEnvelope[];

  /**
   * The same gated write, refused by the host.
   *
   * Carries no `system/permission_denied` line, unlike {@link HOSTED} and
   * {@link DENIED}: that line reports a local rule deciding, and here the
   * decision came from the host instead. An adapter reading only that line
   * would miss every refusal a wearer actually made.
   */
  export const REFUSE: IEnvelope[] = refuse as unknown as IEnvelope[];

  /** Every capture, for the rules that hold across all of them. */
  export const ALL: readonly { name: string; stream: IEnvelope[] }[] =
    Object.freeze([
      { name: "plain", stream: PLAIN },
      { name: "tool", stream: TOOL },
      { name: "denied", stream: DENIED },
      { name: "partial", stream: PARTIAL },
      { name: "hosted", stream: HOSTED },
      { name: "approve", stream: APPROVE },
      { name: "refuse", stream: REFUSE },
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
    "control_request",
    "control_response",
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

  /**
   * The content blocks of one line, or none.
   *
   * Guards the string shorthand a host may send in, so a walk over blocks does
   * not have to know which side produced the line it is looking at.
   */
  export const blocks = (
    line: IEnvelope,
  ): { type: string; text?: string; is_error?: boolean }[] =>
    Array.isArray(line.message?.content) === true ? line.message.content : [];

  /** The kind of one line, as {@link KINDS} spells it. */
  export const kind = (line: IEnvelope): string =>
    line.subtype === undefined ? line.type : `${line.type}/${line.subtype}`;
}
