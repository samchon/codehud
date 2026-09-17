import answers from "./fixtures/codex/answers.json";
import approve from "./fixtures/codex/approve.json";
import plain from "./fixtures/codex/plain.json";
import refuse from "./fixtures/codex/refuse.json";
import threads from "./fixtures/codex/threads.json";

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
 *                approve  "Run the shell command `echo hello` …", answered "accept"
 *                refuse   the same, answered "decline"
 * ```
 *
 * The answers matter, and the first capture got them wrong. There are two
 * decision vocabularies: the legacy `execCommandApproval` takes a
 * `ReviewDecision` (`approved`, `denied`, `timed_out`), and
 * `item/commandExecution/requestApproval` takes a
 * `CommandExecutionApprovalDecision` (`accept`, `decline`, `cancel`, and no
 * timeout at all). Answering the modern method in the legacy vocabulary got
 * both runs refused by the server, so a fixture named `approve` contained a
 * second refusal. The request says which it wants, in `availableDecisions`.
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
      /** The thread, on `thread/started`. */
      thread?: { id?: string };

      item?: {
        type?: string;
        id?: string;
        text?: string;
        status?: string;
        aggregatedOutput?: string | null;
      };
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

  /**
   * A command execution the wearer allowed, which then ran.
   *
   * The command's output is in the completed item. That is the fact worth
   * having: a capture that merely reached an approval proves nothing about
   * what answering it does.
   */
  export const APPROVE: IMessage[] = approve as unknown as IMessage[];

  /** The same command execution, declined, which then did not run. */
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
   * Written out rather than derived, because an adapter has to decide about
   * each one and a recapture that introduces another is the event this list
   * exists to surface. It already has: `item/commandExecution/outputDelta`
   * appeared only once the captures were redone with the right decision
   * vocabulary, because a command that is never allowed to run never streams
   * any output. The first capture set was structurally complete and missing a
   * notification for exactly that reason.
   */
  export const NOTIFICATIONS: readonly string[] = Object.freeze([
    "account/rateLimits/updated",
    "hook/completed",
    "hook/started",
    "item/agentMessage/delta",
    "item/commandExecution/outputDelta",
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

  /**
   * What each approval request and its answer must look like, per the server.
   *
   * Generated by the installed binary rather than written here:
   *
   * ```text
   * codex app-server generate-json-schema --out <dir>
   * ```
   *
   * from `codex-cli 0.154.0`, keeping the five approval methods' parameter and
   * response schemas and dropping the other several hundred. A schema rather
   * than the generated TypeScript because the generated bindings cannot be
   * imported into a package of this repository without subjecting a vendor's
   * emitted files to its own lint rules, and because a schema is what the
   * binary itself publishes about the wire.
   *
   * It is a floor and not a ceiling. The running server sends at least one
   * field this schema does not declare, which {@link admits} reports and
   * `test_agent_codex_answer_vocabulary` pins.
   */
  export const ANSWERS: Readonly<Record<string, ISchemas>> =
    answers as unknown as Readonly<Record<string, ISchemas>>;

  /**
   * What opening a thread must look like, per the same generator.
   *
   * The two methods that begin a conversation, with their parameter schemas and
   * the definitions those reach. Kept apart from {@link ANSWERS} because they
   * answer a different question: not what a wearer may say, but whether the
   * request an adapter opens with is one the server would accept at all.
   */
  export const THREADS: Readonly<Record<string, IRequest>> =
    threads as unknown as Readonly<Record<string, IRequest>>;

  /** The two halves of one approval exchange, as the server describes them. */
  export interface IRequest {
    /** What is sent. */
    params: ISchema;
  }

  /** One exchange whose two halves are both described. */
  export interface ISchemas extends IRequest {
    /** What comes back. */
    result: ISchema;
  }

  /** As much of JSON Schema draft-07 as these five documents use. */
  export interface ISchema {
    /** Reference to a sibling definition, by pointer. */
    $ref?: string;

    /** Named subschemas the document's references resolve against. */
    definitions?: Record<string, ISchema>;

    /** Declared members of an object. */
    properties?: Record<string, ISchema>;

    /** Members an object cannot omit. */
    required?: string[];

    /** Admissible values, for a closed set. */
    enum?: string[];

    /** Alternatives, exactly one of which a value satisfies. */
    oneOf?: ISchema[];

    /** Alternatives, at least one of which a value satisfies. */
    anyOf?: ISchema[];

    /** Constraints a value satisfies together, used here to carry a default. */
    allOf?: ISchema[];

    /** JSON type or types, as draft-07 spells them. */
    type?: string | string[];
  }

  /**
   * What is wrong with one value against one of these schemas.
   *
   * Returns an empty list when the value is admitted. Deliberately not a
   * general validator: it covers references, closed unions, object membership
   * and the primitive types these five documents use, and reports anything it
   * does not understand as admitted rather than pretending to judge it.
   *
   * An undeclared member is a complaint. That is stricter than draft-07's
   * default and is the point: it is what turns "the server sent a field its own
   * schema does not mention" from an invisible fact into a recorded one.
   */
  export const admits = (
    schema: ISchema,
    value: unknown,
    root: ISchema,
    path: string = "",
  ): string[] => {
    const here: ISchema = resolve(schema, root);
    const at: string = path === "" ? "value" : path;

    if (here.oneOf !== undefined || here.anyOf !== undefined) {
      const branches: ISchema[] = here.oneOf ?? here.anyOf ?? [];
      return branches.some(
        (branch) => admits(branch, value, root, path).length === 0,
      )
        ? []
        : [`${at} matches none of the alternatives`];
    }
    if (here.allOf !== undefined)
      return here.allOf.flatMap((one) => admits(one, value, root, path));

    if (here.enum !== undefined)
      return here.enum.includes(value as string)
        ? []
        : [`${at} is not one of ${here.enum.join(", ")}`];

    const types: string[] = (
      here.type === undefined
        ? []
        : typeof here.type === "string"
          ? [here.type]
          : here.type
    ).filter((name) => KINDS[name] !== undefined);
    if (types.length > 0 && types.some((name) => KINDS[name]!(value)) === false)
      return [`${at} is not of type ${types.join(" or ")}`];
    if (value === null) return [];

    if (here.properties !== undefined || types.includes("object") === true) {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        return [`${at} is not of type object`];
      const declared: Record<string, ISchema> = here.properties ?? {};
      const entries: [string, unknown][] = Object.entries(value);
      return [
        ...(here.required ?? [])
          .filter((key) => entries.some(([name]) => name === key) === false)
          .map((key) => `${at} omits ${key}`),
        ...entries.flatMap(([name, member]) =>
          declared[name] === undefined
            ? [`${at} declares no ${name}`]
            : admits(declared[name], member, root, `${at}.${name}`),
        ),
      ];
    }

    return [];
  };

  /**
   * What each JSON type name admits.
   *
   * A table rather than a chain of checks because the chain had a hole: a
   * schema whose only type was `null` fell past every branch and admitted
   * anything, which silently turned the `anyOf` alternatives these documents
   * use for optional members into no constraint at all.
   */
  const KINDS: Record<string, (value: unknown) => boolean> = {
    null: (value) => value === null,
    string: (value) => typeof value === "string",
    boolean: (value) => typeof value === "boolean",
    integer: (value) => typeof value === "number",
    number: (value) => typeof value === "number",
    array: (value) => Array.isArray(value),
    object: (value) =>
      typeof value === "object" &&
      value !== null &&
      Array.isArray(value) === false,
  };

  /** One reference followed, or the schema itself when it holds none. */
  const resolve = (schema: ISchema, root: ISchema): ISchema => {
    if (schema.$ref === undefined) return schema;
    const name: string | undefined = schema.$ref.split("/").at(-1);
    const found: ISchema | undefined =
      name === undefined ? undefined : root.definitions?.[name];
    if (found === undefined)
      throw new Error(`the schema has no definition for ${schema.$ref}`);
    return found;
  };

  /** Messages the server sent, dropping the client's own half. */
  export const sent = (stream: IMessage[]): IMessage[] =>
    stream.filter((line) => line.__direction !== "client->server");

  /** The item kind a line carries, if it carries one. */
  export const item = (line: IMessage): string | undefined =>
    line.params?.item?.type;

  /**
   * The completed command execution of a capture, if it has one.
   *
   * Exists so a case can ask what answering an approval actually did, rather
   * than only that the exchange was well formed.
   */
  export const command = (
    stream: IMessage[],
  ): { status?: string; aggregatedOutput?: string | null } | undefined =>
    sent(stream)
      .filter(
        (line) =>
          line.method === "item/completed" && item(line) === "commandExecution",
      )
      .map(
        (line) =>
          line.params?.item as {
            status?: string;
            aggregatedOutput?: string | null;
          },
      )
      .at(-1);
}
