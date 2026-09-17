import {
  CodeHudCodexNormalizer,
  CodeHudCodexSession,
  type ICodeHudHarnessChannel,
} from "@codehud/agent";
import type {
  ICodeHudAgentEvent,
  ICodeHudAgentPermission,
} from "@codehud/interface";
import { TestValidator } from "@nestia/e2e";

import { Codex } from "../internal/codex";

/**
 * An answer reaches Codex in the words the request it answers accepts.
 *
 * The five approval requests this server sends do not share an answer shape.
 * From the schema the installed binary generates for itself
 * (`codex app-server generate-json-schema`, codex-cli 0.154.0):
 *
 * | request                                 | response                          |
 * | --------------------------------------- | --------------------------------- |
 * | `item/commandExecution/requestApproval` | `{ decision }`, modern enumeration |
 * | `item/fileChange/requestApproval`       | `{ decision }`, modern enumeration |
 * | `item/permissions/requestApproval`      | `{ permissions, scope }`           |
 * | `applyPatchApproval`                    | `{ decision }`, `ReviewDecision`   |
 * | `execCommandApproval`                   | `{ decision }`, `ReviewDecision`   |
 *
 * The adapter used to send `{ decision: "accept" }` to all five. One of them
 * accepts no `decision` field at all — its answer is the permission profile
 * being granted — and the legacy pair take a vocabulary in which `accept` is
 * not a word. A wrong shape does not fail loudly: the server declines the
 * answer, the wearer is told theirs landed, and the agent stays blocked on the
 * question they believe they settled. This repository has already made that
 * exact mistake once, in the other direction, and found it only by reading
 * what a run produced rather than what a type declared.
 *
 * Judging is therefore done against the server's own schema rather than against
 * expectations written here, which would be the same reading twice.
 *
 * The second subject is which answers are offered at all. Every affirmative
 * answer to a permissions request grants filesystem or network access for a
 * turn or a session, and several command answers amend a policy for a class of
 * future commands. Their scope is structured data — a command prefix vector, a
 * host and a rule action, a list of paths — that a two-line display cannot
 * render, so a wearer choosing one could not know what they gave. None is
 * offered, and the server's own `availableDecisions`, which does list them, is
 * deliberately not mirrored.
 *
 * Only the command request appears in a capture. The others are built here and
 * checked against the server's parameter schema, so a synthesized request is at
 * least a shape the server could have sent.
 *
 * Scenarios:
 *
 * 1. The checker is armed: an answer in the wrong vocabulary is rejected by the
 *    schema of the method it was sent to, in every direction.
 * 2. Every answer this adapter can write is admitted by the schema of the
 *    method that speaks its vocabulary.
 * 3. The captured command request is answered in the modern vocabulary.
 * 4. A legacy request is answered in the legacy one, whose refusal is a
 *    structure carrying a reason rather than a word.
 * 5. A permissions request offers no affirmative answer, says what it is since
 *    it names no command — its own reason when it gave one and a fixed phrase
 *    when it did not, never the profile it asked for — and is answered by
 *    granting nothing for the turn.
 * 6. A word from another vocabulary is refused by the session rather than
 *    translated, and nothing reaches the server.
 * 7. No offered answer anywhere persists, amends a policy, or lasts a session,
 *    and every request offers a refusal, so none reaches a wearer unclearable.
 * 8. The schema is a floor: the running server sends a field its own schema
 *    does not declare, recorded here rather than assumed away.
 */
export async function test_agent_codex_answer_vocabulary(): Promise<void> {
  const must = (
    vocabulary: CodeHudCodexNormalizer.Vocabulary,
    affirmative: boolean,
  ): ICodeHudAgentPermission => {
    const found: ICodeHudAgentPermission | undefined =
      CodeHudCodexNormalizer.OPTIONS[vocabulary].find(
        (candidate) => candidate.affirmative === affirmative,
      );
    if (found === undefined)
      throw new Error(`${vocabulary} offers no ${affirmative ? "yes" : "no"}`);
    return found;
  };
  const schemas = (method: string): Codex.ISchemas => {
    const found: Codex.ISchemas | undefined = Codex.ANSWERS[method];
    if (found === undefined) throw new Error(`no schema for ${method}`);
    return found;
  };
  const judge = (method: string, answer: unknown): string[] =>
    Codex.admits(schemas(method).result, answer, schemas(method).result);

  // 1. The checker rejects what the server would reject. Without this, the
  // scenario below would pass just as well with a validator admitting anything.
  TestValidator.predicate(
    "a legacy word is not an answer to a modern request",
    judge("item/commandExecution/requestApproval", { decision: "approved" })
      .length > 0,
  );
  TestValidator.predicate(
    "nor a modern word to a legacy one",
    judge("execCommandApproval", { decision: "accept" }).length > 0,
  );
  TestValidator.predicate(
    "and a decision is no answer at all to a permissions request",
    judge("item/permissions/requestApproval", { decision: "accept" }).length >
      0,
  );

  // Two requests built rather than captured: these methods never appeared in a
  // run, so they are checked against the server's own parameter schema below
  // before anything is concluded from what answering them produces.
  const older: Record<string, unknown> = {
    conversationId: "thread-01",
    callId: "call-01",
    approvalId: null,
    command: ["echo", "hello"],
    cwd: "/repo",
    reason: null,
    parsedCmd: [],
  };
  const escalation: Record<string, unknown> = {
    threadId: "thread-01",
    turnId: "turn-01",
    itemId: "item-03",
    environmentId: "local",
    startedAtMs: 0,
    cwd: "/repo",
    reason: "Read outside the workspace",
    permissions: { network: { enabled: true }, fileSystem: null },
  };

  // The checker's own arms, since it is judging everything below. A schema the
  // fixture does not carry is reported rather than quietly admitted, and a
  // schema constraining nothing admits anything, which is draft-07's own rule.
  const params: Codex.ISchema = schemas(
    "item/permissions/requestApproval",
  ).params;
  const wrong = (patch: Record<string, unknown>): string[] =>
    Codex.admits(params, { ...escalation, ...patch }, params);
  TestValidator.equals(
    "a path that is a number is not a path",
    wrong({ cwd: 7 }),
    ["value.cwd is not of type string"],
  );
  TestValidator.equals(
    "a timestamp that is a string is not a timestamp",
    wrong({ startedAtMs: "0" }),
    ["value.startedAtMs is not of type integer"],
  );
  TestValidator.equals(
    "a flag that is a word is not a flag",
    Codex.admits(
      schemas("item/permissions/requestApproval").result,
      { permissions: {}, scope: "turn", strictAutoReview: "yes" },
      schemas("item/permissions/requestApproval").result,
    ),
    ["value.strictAutoReview is not of type boolean or null"],
  );
  TestValidator.equals(
    "and an alternative satisfied by none of its branches says so once",
    wrong({ permissions: { network: { enabled: "yes" }, fileSystem: null } }),
    ["value.permissions.network matches none of the alternatives"],
  );
  TestValidator.equals(
    "and a profile that is a number is not a profile",
    wrong({ permissions: 5 }),
    ["value.permissions is not of type object"],
  );
  TestValidator.equals(
    "a command that is one string is not an argument vector",
    Codex.admits(
      schemas("execCommandApproval").params,
      { ...older, command: "echo hello" },
      schemas("execCommandApproval").params,
    ),
    ["value.command is not of type array"],
  );
  TestValidator.equals(
    "a schema constraining nothing admits anything",
    Codex.admits({}, 1, {}),
    [],
  );
  TestValidator.error("and a dangling reference is reported", () =>
    Codex.admits({ $ref: "#/definitions/Nope" }, 1, {}),
  );

  // 2. Every answer, against the schema of the method that speaks for it.
  for (const [method, vocabulary] of CodeHudCodexNormalizer.APPROVALS)
    for (const offered of CodeHudCodexNormalizer.OPTIONS[vocabulary])
      TestValidator.equals(
        `${method} admits its own ${offered.label.toLowerCase()}`,
        judge(method, CodeHudCodexNormalizer.answer(vocabulary, offered)),
        [],
      );

  // 3-6. What each method actually puts on the wire.
  class Channel implements ICodeHudHarnessChannel {
    public readonly written: Record<string, unknown>[] = [];
    public constructor(private readonly feed: readonly unknown[]) {}
    public get lines(): AsyncIterable<unknown> {
      const feed: readonly unknown[] = this.feed;
      return {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<unknown> {
          for (const line of feed) yield line;
        },
      };
    }
    public async write(value: unknown): Promise<void> {
      this.written.push(value as Record<string, unknown>);
    }
    public async close(): Promise<void> {}
  }

  const asked = async (
    feed: readonly unknown[],
  ): Promise<{
    channel: Channel;
    session: CodeHudCodexSession;
    pending: ICodeHudAgentEvent.IPermission;
  }> => {
    const channel: Channel = new Channel(feed);
    const session: CodeHudCodexSession = new CodeHudCodexSession(
      "s1",
      channel,
      { thread: "t", directory: "/repo", now: () => 0 },
    );
    for await (const event of session.events)
      if (event.type === "permission")
        return { channel, session, pending: event };
    throw new Error("the feed asked nothing");
  };

  // The one request a capture contains.
  const modern = await asked(Codex.sent(Codex.APPROVE));
  await modern.session.send({
    type: "decision",
    request: modern.pending.request,
    option: must("modern", true).id,
  });
  TestValidator.equals(
    "a captured command request is answered in the modern vocabulary",
    modern.channel.written[0]?.result,
    { decision: "accept" },
  );

  for (const [method, params] of [
    ["execCommandApproval", older],
    ["item/permissions/requestApproval", escalation],
  ] as const)
    TestValidator.equals(
      `the synthesized ${method} is a request the server could send`,
      Codex.admits(schemas(method).params, params, schemas(method).params),
      [],
    );

  const legacy = await asked([
    { id: 7, method: "execCommandApproval", params: older },
  ]);
  await legacy.session.send({
    type: "decision",
    request: legacy.pending.request,
    option: must("legacy", false).id,
  });
  TestValidator.equals(
    "a legacy request is answered in the legacy vocabulary",
    legacy.channel.written[0]?.result,
    { decision: { denied: { rejection: CodeHudCodexNormalizer.REJECTION } } },
  );

  const wider = await asked([
    { id: 9, method: "item/permissions/requestApproval", params: escalation },
  ]);
  TestValidator.equals(
    "a permissions request offers no affirmative answer at all",
    wider.pending.options.map((offered) => offered.affirmative),
    [false],
  );
  TestValidator.equals(
    "and says what it is, since it names no command",
    wider.pending.title,
    "Read outside the workspace",
  );

  const silent = await asked([
    {
      id: 11,
      method: "item/permissions/requestApproval",
      params: { ...escalation, reason: null },
    },
  ]);
  TestValidator.equals(
    "a request that gave no reason still says something",
    silent.pending.title,
    CodeHudCodexNormalizer.ESCALATION,
  );
  TestValidator.predicate(
    "which never spells out the profile it asked for",
    silent.pending.title.includes("network") === false &&
      silent.pending.title.includes("/") === false,
  );
  await wider.session.send({
    type: "decision",
    request: wider.pending.request,
    option: must("profile", false).id,
  });
  TestValidator.equals(
    "and is answered by granting nothing, for the turn",
    wider.channel.written[0]?.result,
    { permissions: {}, scope: "turn" },
  );

  // 6. The session refuses a word belonging to another method's vocabulary.
  const crossed = await asked(Codex.sent(Codex.APPROVE));
  await TestValidator.error("a legacy word answers no modern request", () =>
    crossed.session.send({
      type: "decision",
      request: crossed.pending.request,
      option: "approved",
    }),
  );
  TestValidator.equals(
    "and nothing reached the server",
    crossed.channel.written.length,
    0,
  );

  const backwards = await asked([
    { id: 7, method: "execCommandApproval", params: older },
  ]);
  await TestValidator.error("nor a modern word a legacy request", () =>
    backwards.session.send({
      type: "decision",
      request: backwards.pending.request,
      option: "accept",
    }),
  );
  TestValidator.equals(
    "in that direction either",
    backwards.channel.written.length,
    0,
  );

  // 7. What a wearer is ever offered, across every vocabulary.
  for (const vocabulary of ["modern", "legacy", "profile"] as const) {
    const options: readonly ICodeHudAgentPermission[] =
      CodeHudCodexNormalizer.OPTIONS[vocabulary];
    TestValidator.equals(
      `${vocabulary} offers nothing that persists`,
      options.some((offered) => offered.persistent === true),
      false,
    );
    TestValidator.equals(
      `${vocabulary} offers nothing that amends a policy or lasts a session`,
      options.some(
        (offered) =>
          offered.id.toLowerCase().includes("amendment") ||
          offered.id.toLowerCase().includes("session"),
      ),
      false,
    );
    TestValidator.equals(
      `${vocabulary} always offers a refusal`,
      options.some((offered) => offered.affirmative === false),
      true,
    );
  }

  // The server does propose the amendments this surface declines, so their
  // absence is a decision rather than an absence of opportunity.
  const proposal = Codex.sent(Codex.APPROVE).find(
    (line) => line.method === "item/commandExecution/requestApproval",
  );
  TestValidator.predicate(
    "the captured request did offer a policy amendment",
    JSON.stringify(
      (proposal?.params as { availableDecisions?: unknown } | undefined)
        ?.availableDecisions,
    ).includes("acceptWithExecpolicyAmendment"),
  );
  TestValidator.equals(
    "and the wearer was offered only the two narrow answers",
    modern.pending.options.map((offered) => offered.id),
    ["accept", "decline"],
  );

  // 8. The schema is a floor. The binary sends a field it does not declare, so
  // a later reader knows the generated description trails its own server.
  TestValidator.equals(
    "the captured request carries one field the schema omits",
    Codex.admits(
      schemas("item/commandExecution/requestApproval").params,
      proposal?.params,
      schemas("item/commandExecution/requestApproval").params,
    ),
    ["value declares no availableDecisions"],
  );
}
