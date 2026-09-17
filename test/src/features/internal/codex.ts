import approve from "./fixtures/codex/approve.json";
import plain from "./fixtures/codex/plain.json";
import refuse from "./fixtures/codex/refuse.json";

/**
 * What `codex app-server` actually sends, captured from runs.
 *
 * Codex generates its own protocol types, so unlike Claude Code the *shape* of
 * every message is already compile-checked. What generation cannot say is which
 * messages arrive, in what order, and how often. These captures answer that, and
 * the answer was not what reading the type definitions suggested.
 *
 * Captured from `codex-cli 0.154.0` on Windows, in a throwaway directory holding
 * one file, driven over stdio JSON-RPC:
 *
 * ```text
 * initialize
 * thread/start   cwd, approvalPolicy "untrusted", sandbox "read-only",
 *                approvalsReviewer "user"
 * turn/start     plain    "Reply with exactly the word: pong."
 *                approve  "Run the shell command `echo hello` …", answered approved
 *                refuse   the same, answered { denied: { rejection } }
 * ```
 *
 * **Scrubbed.** Field names and types as captured; identifiers renumbered,
 * durations and token counts zeroed, and the values that were this machine's or
 * this account's replaced rather than deleted. The leak scan earned its place
 * twice here: the first pass missed eighteen home-directory paths, because
 * session and hook paths live under the home directory and never mention the
 * working directory the scrubber was rewriting; the second pass still let six
 * through, because a hook run is identified by a string with a path inside it
 * and the identifier rule short-circuited the string rule.
 */
export namespace Codex {
  /**
   * One JSON-RPC message, as far as anything here needs it.
   *
   * Loose on purpose, and narrower than the generated bindings: this is for
   * inventorying and walking captures, not for typing the protocol. The adapter
   * compiles against `@codehud/codex-protocol`, which is the vendor's own
   * description and the only thing that should be believed about shape.
   */
  export interface IMessage {
    /** Which way the message travelled, recorded by the capture. */
    __direction?: "client->server" | "server->client";

    /** Correlation identifier, on requests and responses. */
    id?: number;

    /** Method, on a notification or a request. */
    method?: string;

    /** Whatever the method carries. */
    params?: {
      item?: { type?: string; id?: string; text?: string };
      delta?: string;
      threadId?: string;
      turn?: { status?: string; durationMs?: number; error?: unknown };
      status?: { type?: string; activeFlags?: string[] };
    };

    /** Whatever a request was answered with. */
    result?: Record<string, unknown>;
  }

  /** A turn with no tool call: the shortest exchange the server produces. */
  export const PLAIN: IMessage[] = plain as unknown as IMessage[];

  /** A command execution the wearer allowed. */
  export const APPROVE: IMessage[] = approve as unknown as IMessage[];

  /** The same command execution, refused. */
  export const REFUSE: IMessage[] = refuse as unknown as IMessage[];

  /** Every capture, for the rules that hold across all of them. */
  export const ALL: readonly { name: string; stream: IMessage[] }[] =
    Object.freeze([
      { name: "plain", stream: PLAIN },
      { name: "approve", stream: APPROVE },
      { name: "refuse", stream: REFUSE },
    ]);

  /**
   * Every notification the server sent across these captures.
   *
   * Fourteen, of which two carry the conversation and the rest are bookkeeping
   * a wearer would do nothing differently for. Written out rather than derived,
   * because an adapter has to decide about each one and a recapture that
   * introduces a fifteenth is the event this list exists to surface.
   */
  export const NOTIFICATIONS: readonly string[] = Object.freeze([
    "account/rateLimits/updated",
    "hook/completed",
    "hook/started",
    "item/agentMessage/delta",
    "item/completed",
    "item/started",
    "mcpServer/startupStatus/updated",
    "remoteControl/status/changed",
    "serverRequest/resolved",
    "thread/started",
    "thread/status/changed",
    "thread/tokenUsage/updated",
    "turn/completed",
    "turn/started",
  ]);

  /**
   * Every request the server made of its client.
   *
   * One, in these captures. The protocol declares five approval-shaped requests
   * and two more that ask for input; an ordinary turn produced exactly one of
   * them. An adapter still has to answer the others, but it now knows which one
   * it will actually meet.
   */
  export const REQUESTS: readonly string[] = Object.freeze([
    "item/commandExecution/requestApproval",
  ]);

  /**
   * Every thread item kind these captures contain.
   *
   * Four. `ThreadItem` declares nineteen, and a mapping written from the type
   * definitions would have spent most of its rules on kinds no ordinary turn
   * produces. That gap is the whole reason for capturing rather than reading.
   */
  export const ITEMS: readonly string[] = Object.freeze([
    "agentMessage",
    "commandExecution",
    "reasoning",
    "userMessage",
  ]);

  /** Messages the server sent, dropping the client's own half. */
  export const sent = (stream: IMessage[]): IMessage[] =>
    stream.filter((line) => line.__direction !== "client->server");

  /** The item kind a line carries, if it carries one. */
  export const item = (line: IMessage): string | undefined =>
    line.params?.item?.type;
}
