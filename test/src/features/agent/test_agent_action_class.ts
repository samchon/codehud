import {
  CodeHudActionClass,
  CodeHudClaudeNormalizer,
  CodeHudCodexNormalizer,
} from "@codehud/agent";
import type { ICodeHudAgentEvent } from "@codehud/interface";
import { TestValidator } from "@nestia/e2e";

import { Claude } from "../internal/claude";
import { Codex } from "../internal/codex";

/**
 * A request says which class of action it would perform.
 *
 * Without this the session policy governs only what never reaches the wearer.
 * Four of its eight classes — deletion, history rewriting, force publication,
 * credential exposure — default to being asked about twice, and nothing could
 * put a request into any of them: both harnesses do all four through their
 * ordinary execution tool, so a classification by tool name files every one of
 * them under *execute* and the strongest promise in the product is made about a
 * class nothing can enter.
 *
 * So the command is read, against a table of literal program and subcommand
 * shapes. The table is a **floor, not a ceiling**, and this case says so rather
 * than implying coverage that does not exist: a command it does not recognize
 * is not thereby safe. The direction of its errors is the chosen one — calling
 * something harmless destructive costs a wearer one spoken word, and missing
 * something destructive costs them a repository.
 *
 * The wrapper cases are not decoration. A harness routinely asks about
 * `bash -lc "rm -rf build"`, and a classifier reading only the outermost
 * program would call that a shell invocation and file every destructive command
 * an agent ever runs under execution.
 *
 * Scenarios:
 *
 * 1. A tool name alone reaches the four classes that have tools, and no
 *    further.
 * 2. A command reaches the four that do not: deletion, history rewriting,
 *    publication, credential exposure — including the shapes added after the
 *    table was first written, and excluding the truncating redirect it states
 *    as a known miss rather than hiding.
 * 3. A forced push is history rather than publication, because the first match
 *    in a stated order is the reported one and losing commits is the worse of
 *    the two.
 * 4. The shapes are word-boundaried: `rm` is deletion and `rmadison` is not.
 * 5. A wrapped command is classified by what it would run, through the shells a
 *    harness actually uses, and through more than one layer. A chained one is
 *    classified by every command in the chain rather than by its head — which
 *    is not hypothetical: a real harness asked about
 *    `ls -l hello.txt && rm hello.txt && ls -l`, the head was a listing, and
 *    the deletion went through on one spoken word. Splitting and peeling happen
 *    together rather than in sequence, because a wrapper can sit after a
 *    separator (`echo hi && bash -lc "rm -rf x"`) as easily as a chain can sit
 *    inside a wrapper, and doing either one first misses the other.
 * 6. An unrecognized command is execution rather than nothing, and an
 *    unrecognized *tool* is nothing rather than a guess.
 * 7. Both adapters put the class on the observation they produce, so it reaches
 *    the wearer's side without the device axis ever importing the harness one.
 */
export async function test_agent_action_class(): Promise<void> {
  // 1. What a tool name says by itself.
  for (const [tool, expected] of [
    ["Read", "read"],
    ["Grep", "read"],
    ["Write", "write"],
    ["NotebookEdit", "write"],
    ["WebFetch", "network"],
    ["Task", "execute"],
  ] as const)
    TestValidator.equals(
      `${tool} is ${expected}`,
      CodeHudActionClass.of({ tool }),
      expected,
    );

  // 2. What only the command can say.
  for (const [command, expected] of [
    ["rm -rf build", "delete"],
    ["git clean -fdx", "delete"],
    ["shred -u secret.key", "delete"],
    ["git reset --hard HEAD~3", "history"],
    ["git commit --amend --no-edit", "history"],
    ["git rebase -i origin/master", "history"],
    ["npm publish --access public", "publish"],
    ["docker push registry/app:latest", "publish"],
    ["cat .env", "credential"],
    ["echo $AWS_SECRET_ACCESS_KEY", "credential"],
    ["cp ~/.aws/credentials /tmp/x", "credential"],
  ] as const)
    TestValidator.equals(
      `${command} is ${expected}`,
      CodeHudActionClass.of({ tool: "Bash", command }),
      expected,
    );

  // 2b. The shapes added after the table was first written, each of them
  // something an agent runs and a wearer would not want to lose on one word.
  for (const [command, expected] of [
    ["git checkout . ", "history"],
    ["git restore --staged --worktree .", "history"],
    ["git stash drop", "history"],
    ["git branch -d feature", "history"],
    ["docker volume rm data", "delete"],
    ["kubectl delete pod api", "delete"],
    ["ri -Recurse build", "delete"],
  ] as const)
    TestValidator.equals(
      `${command.trim()} is ${expected}`,
      CodeHudActionClass.of({ tool: "Bash", command }),
      expected,
    );

  // And the hole this table states rather than hides: a truncating redirect
  // destroys a file and names no program, and is deliberately not matched
  // because most redirects are harmless and a second word in front of every
  // one of them is the fatigue the policy exists to prevent.
  TestValidator.equals(
    "a truncating redirect is a known miss, not an oversight",
    CodeHudActionClass.of({
      tool: "Bash",
      command: "echo x > important.txt",
    }),
    "execute",
  );

  // 3. Two classes, one command, and the worse one reported.
  TestValidator.equals(
    "a forced push is history rewriting rather than publication",
    CodeHudActionClass.of({ tool: "Bash", command: "git push --force origin" }),
    "history",
  );
  TestValidator.equals(
    "while an ordinary push is neither",
    CodeHudActionClass.of({ tool: "Bash", command: "git push origin master" }),
    "execute",
  );

  // 4. Word boundaries, so a prefix is not a match.
  TestValidator.equals(
    "rmadison is not rm",
    CodeHudActionClass.of({ tool: "Bash", command: "rmadison libfoo" }),
    "execute",
  );
  TestValidator.equals(
    "and git rebasement is not git rebase",
    CodeHudActionClass.of({ tool: "Bash", command: "git rebasement" }),
    "execute",
  );

  // 5. Wrappers, which is how a harness actually words it.
  for (const command of [
    `bash -lc "rm -rf build"`,
    `sh -c 'rm -rf build'`,
    `zsh -c "rm -rf build"`,
    `powershell.exe -Command "rm -rf build"`,
    `sudo rm -rf build`,
    `CI=1 bash -lc "rm -rf build"`,
    `bash -lc "sh -c 'rm -rf build'"`,
  ])
    TestValidator.equals(
      `${command} is still deletion`,
      CodeHudActionClass.of({ tool: "Bash", command }),
      "delete",
    );

  // 5b. Chains, which is how an agent actually words it. Every one of these
  // was reported as execution until a real harness asked about the first of
  // them and a real deletion went through on one spoken word.
  for (const [command, expected] of [
    ["ls -l hello.txt && rm hello.txt && ls -l", "delete"],
    ["cd /repo; rm -rf build", "delete"],
    ["cat x | rm y", "delete"],
    [`bash -lc "ls && rm -rf build"`, "delete"],
    ["npm run build && npm publish", "publish"],
    ["git status && git push --force", "history"],
  ] as const)
    TestValidator.equals(
      `a chain is classified by what it would run, not by its head: ${command}`,
      CodeHudActionClass.of({ tool: "Bash", command }),
      expected,
    );
  TestValidator.equals(
    "and a chain of harmless commands is still execution",
    CodeHudActionClass.of({ tool: "Bash", command: "echo ok && ls -l" }),
    "execute",
  );

  // 5c. A wrapper that is not at the front of the line. Splitting and peeling
  // have to happen together: peeling first misses these, splitting first misses
  // the wrapped chain above, and an agent writes both.
  for (const [command, expected] of [
    [`echo hi && bash -lc "rm -rf build"`, "delete"],
    ["cd /tmp; sudo rm -rf build", "delete"],
    ["ls && sudo rm -rf x", "delete"],
    [`git status && CI=1 bash -lc "npm publish"`, "publish"],
  ] as const)
    TestValidator.equals(
      `a wrapper later in the line is still peeled: ${command}`,
      CodeHudActionClass.of({ tool: "Bash", command }),
      expected,
    );
  TestValidator.predicate(
    "and taking a line apart is bounded rather than open-ended",
    CodeHudActionClass.lines(
      // Distinct on purpose: five hundred copies of one command collapse to one
      // line and would pass whether or not anything bounded them.
      new Array(500)
        .fill(0)
        .map((_, index) => `echo ${index}`)
        .join(" && "),
    ).length <= CodeHudActionClass.BREADTH,
  );

  // 6. What it does when it cannot tell, in each direction.
  TestValidator.equals(
    "an unrecognized command is execution rather than nothing",
    CodeHudActionClass.of({ tool: "Bash", command: "pnpm run build" }),
    "execute",
  );
  TestValidator.equals(
    "an unrecognized tool is nothing rather than a guess",
    CodeHudActionClass.of({ tool: "SomeFutureTool" }),
    undefined,
  );
  TestValidator.equals(
    "and nothing at all is nothing",
    CodeHudActionClass.of({}),
    undefined,
  );

  // 7. The class reaches the observation, on both harness families.
  const claude: CodeHudClaudeNormalizer = new CodeHudClaudeNormalizer(
    "s1",
    () => 0,
  );
  const asked: ICodeHudAgentEvent.IPermission | undefined = Claude.sent(
    Claude.APPROVE,
  )
    .flatMap((line) => claude.normalize(line as CodeHudClaudeNormalizer.ILine))
    .find(
      (event): event is ICodeHudAgentEvent.IPermission =>
        event.type === "permission",
    );
  TestValidator.equals(
    "Claude Code's captured request carries the class it would perform",
    asked?.action,
    "write",
  );

  const codex: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s2",
    () => 0,
  );
  const requested: ICodeHudAgentEvent.IPermission | undefined = Codex.sent(
    Codex.APPROVE,
  )
    .flatMap((line) => codex.normalize(line as CodeHudCodexNormalizer.IMessage))
    .find(
      (event): event is ICodeHudAgentEvent.IPermission =>
        event.type === "permission",
    );
  TestValidator.equals(
    "and so does Codex's, from the command alone",
    requested?.action,
    "execute",
  );

  const destructive: CodeHudCodexNormalizer = new CodeHudCodexNormalizer(
    "s3",
    () => 0,
  );
  const dangerous: ICodeHudAgentEvent[] = destructive.normalize({
    id: 4,
    method: "item/commandExecution/requestApproval",
    params: {
      command: `powershell.exe -Command 'rm -rf build'`,
      cwd: "/repo",
    },
  });
  TestValidator.equals(
    "a deletion is reported as one rather than as an execution",
    (dangerous[0] as ICodeHudAgentEvent.IPermission).action,
    "delete",
  );
}
