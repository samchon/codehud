import { CodeHudCodexNormalizer } from "@codehud/agent";
import type { ICodeHudAgentEvent } from "@codehud/interface";
import { TestValidator } from "@nestia/e2e";

import { Assert } from "../internal/assert";
import { Codex } from "../internal/codex";

/**
 * A Codex file change is shown as work, and its approval says what it is about.
 *
 * Seen in the first end-to-end Codex run through the bridge. The wearer was
 * shown a box reading *Wider access requested* over the working directory and
 * asked to allow or deny it. What was actually being asked was whether an agent
 * could write `hello.txt`, and the phrase on the display is the one this adapter
 * reserves for the request that really is about access. Two different questions
 * looked identical on the one surface where a follow-up cannot be asked.
 *
 * Two gaps produced it, and the second is the larger. The request carries no
 * subject: `FileChangeRequestApprovalParams` is `threadId`, `turnId`, `itemId`,
 * `startedAtMs`, an optional reason and an optional grant root, and no path at
 * all. And the item that does carry the paths was absorbed — `item` handled
 * three kinds and dropped the rest — so a Codex write left no observation, no
 * line in the history, and nothing for the `itemId` to name.
 *
 * The item arrives first, which is what makes the fix possible rather than
 * merely desirable. It is the same trick the command executions already use:
 * remember the description under the identifier, and let the question find it.
 *
 * Scenarios:
 *
 * 1. The captured turn produces a tool observation for the file it wrote, at
 *    both phases, under the item's own identifier.
 * 2. Its title is the server's own word for the change and the file it names,
 *    rather than a phrase invented here.
 * 3. The approval that follows is titled from that item instead of from the
 *    escalation phrase, and still reports the class it would perform.
 * 4. The escalation phrase still belongs to the request it was written for: a
 *    permissions request naming nothing says it.
 * 5. An approval for an item nobody saw — one arriving ahead of its item, or a
 *    resumed conversation — falls back rather than inventing a subject.
 * 6. A reason the server did give is not lost when the item supplies a better
 *    title: it moves to the line under it, which a file-change request leaves
 *    empty because it carries no working directory.
 * 7. The description covers the change shapes the bindings declare — added,
 *    deleted, updated, moved — and counts the rest rather than listing them.
 *
 * Every comparison of a whole value goes through {@link Assert.equals}, which
 * scenario 0 arms. `TestValidator.equals` accepts a member the expected value
 * declares and the actual one does not, and the members this case exists to
 * pin — the title on an approval, the line under it — are optional ones.
 */
export async function test_agent_codex_file_change(): Promise<void> {
  const run = (stream: Codex.IMessage[]): ICodeHudAgentEvent[] => {
    const normalizer: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
      "s1",
      () => 0,
    );
    return Codex.sent(stream).flatMap((message) =>
      normalizer.normalize(message as CodeHudCodexNormalizer.IMessage),
    );
  };

  // 0. The assertion this case leans on, armed rather than trusted. Without
  // this wrapper the two comparisons that matter most below are green whatever
  // the adapter does, which is how the gap was found in the first place.
  TestValidator.predicate(
    "a member the expected value declares and the actual one lacks is reported",
    Assert.compares({ title: "x" }, { title: "x", detail: "y" }) === true &&
      Assert.compares(
        { title: "x", detail: undefined },
        {
          title: "x",
          detail: "y",
        },
      ) === true &&
      Assert.compares(
        { title: "x", detail: "y" },
        { title: "x", detail: "y" },
      ) === false,
  );

  // What the capture actually holds, checked before anything is concluded from
  // it. A case that reads a fixture without saying what it expected to find is
  // green when the fixture is replaced by an empty one.
  const written: Codex.IMessage | undefined = Codex.sent(Codex.WRITE).find(
    (line) => Codex.item(line) === "fileChange",
  );
  Assert.equals(
    "the capture holds a file change, with the path and kind the bindings declare",
    {
      path: written?.params?.item?.changes?.[0]?.path,
      kind: written?.params?.item?.changes?.[0]?.kind?.type,
    },
    { path: "/repo/note.txt", kind: "add" },
  );
  const requested: Codex.IMessage | undefined = Codex.sent(Codex.WRITE).find(
    (line) => line.method === "item/fileChange/requestApproval",
  );
  Assert.equals(
    "and an approval that names the item rather than the file",
    {
      itemId: requested?.params?.itemId,
      command: (requested?.params as { command?: unknown } | undefined)
        ?.command,
      reason: (requested?.params as { reason?: unknown } | undefined)?.reason,
    },
    { itemId: written?.params?.item?.id, command: undefined, reason: null },
  );
  const named: string = written?.params?.item?.id ?? "";
  TestValidator.predicate("and identifies it at all", named.length !== 0);

  const events: ICodeHudAgentEvent[] = run(Codex.WRITE);

  // 1-2. The work, which used to be nothing at all.
  const tools: ICodeHudAgentEvent.ITool[] = events.filter(
    (event): event is ICodeHudAgentEvent.ITool =>
      event.type === "tool" && event.name === "file",
  );
  Assert.equals(
    "the file change is reported at both of its phases",
    tools.map((tool) => tool.phase),
    ["start", "finish"],
  );
  Assert.equals(
    "under the identifier the approval names it by",
    tools.map((tool) => tool.call),
    [named, named],
  );
  Assert.equals(
    "described by the server's own word for the change and the file it names",
    tools.map((tool) => tool.title),
    ["add repo/note.txt", "add repo/note.txt"],
  );
  TestValidator.predicate(
    "and a change that was applied is not marked as having failed",
    tools.every((tool) => tool.failed === undefined),
  );

  // 3. The question, which used to be about something else entirely.
  const permission: ICodeHudAgentEvent.IPermission | undefined = events.find(
    (event): event is ICodeHudAgentEvent.IPermission =>
      event.type === "permission",
  );
  TestValidator.equals(
    "the approval is titled from the item it names",
    permission?.title,
    "add repo/note.txt",
  );
  TestValidator.notEquals(
    "rather than from the phrase reserved for a request about access",
    permission?.title,
    CodeHudCodexNormalizer.ESCALATION,
  );
  TestValidator.equals(
    "and still says what class of action it would perform",
    permission?.action,
    "write",
  );

  // 4. The phrase still belongs to the request it was written for.
  const escalating: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s2",
    () => 0,
  );
  TestValidator.equals(
    "a permissions request naming nothing still asks about access",
    (
      escalating.normalize({
        id: 7,
        method: "item/permissions/requestApproval",
        params: {},
      })[0] as ICodeHudAgentEvent.IPermission
    ).title,
    CodeHudCodexNormalizer.ESCALATION,
  );

  // 5. An item nobody saw is not invented.
  const orphan: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s3",
    () => 0,
  );
  TestValidator.equals(
    "an approval for an item that never arrived falls back rather than guessing",
    (
      orphan.normalize({
        id: 8,
        method: "item/fileChange/requestApproval",
        params: { itemId: "item-99" },
      })[0] as ICodeHudAgentEvent.IPermission
    ).title,
    CodeHudCodexNormalizer.ESCALATION,
  );

  // 6. The reason moves rather than disappearing.
  const explained: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s4",
    () => 0,
  );
  explained.normalize({
    method: "item/started",
    params: {
      item: {
        type: "fileChange",
        id: "item-42",
        changes: [{ path: "/repo/src/index.ts", kind: { type: "update" } }],
        status: "inProgress",
      },
    },
  });
  const both: ICodeHudAgentEvent.IPermission = explained.normalize({
    id: 9,
    method: "item/fileChange/requestApproval",
    params: { itemId: "item-42", reason: "writing outside the  workspace" },
  })[0] as ICodeHudAgentEvent.IPermission;
  Assert.equals(
    "the item supplies the title and the server's reason supplies the line under it",
    { title: both.title, detail: both.detail },
    { title: "update src/index.ts", detail: "writing outside the workspace" },
  );

  // 7. The shapes `PatchChangeKind` declares, and the count that stands in for
  // a list a two-line display could not hold anyway.
  for (const [changes, expected] of [
    [[{ path: "/repo/a.ts", kind: { type: "add" } }], "add repo/a.ts"],
    [[{ path: "/repo/a.ts", kind: { type: "delete" } }], "delete repo/a.ts"],
    [
      [
        {
          path: "/repo/a.ts",
          kind: { type: "update", move_path: "/repo/b.ts" },
        },
      ],
      "update repo/a.ts to repo/b.ts",
    ],
    [
      [
        { path: "/repo/a.ts", kind: { type: "add" } },
        { path: "/repo/b.ts", kind: { type: "add" } },
        { path: "/repo/c.ts", kind: { type: "add" } },
      ],
      "add repo/a.ts and 2 more",
    ],
    [[], "file change"],
  ] as const)
    TestValidator.equals(
      `a change is described as ${expected}`,
      CodeHudCodexNormalizer.changed(changes),
      expected,
    );
}
