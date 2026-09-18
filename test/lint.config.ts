import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * The workspace rules, plus one this package alone needs.
 *
 * Every assertion in this suite goes through `features/internal/assert.ts`, and
 * the reason is written there: two of `@nestia/e2e`'s assertions are wrong for
 * a suite that compares a pure function's whole output against what it should
 * be, in the direction that keeps a case green. Knowing that of six hundred
 * assertions is only possible while they all come through one door, and a
 * convention nothing checks is a convention that lasts until whoever wrote it
 * down stops reading the diffs.
 *
 * `files` scopes this entry to the package's own sources and `ignores` lets the
 * one file that owns the wrapper import what it wraps. Both were checked rather
 * than assumed, by introducing a violation and watching the build fail: the
 * restriction fires in a case file, the workspace rules still fire under the
 * `files` selector, and they still fire inside the ignored file — the ignore
 * refines this entry's rule alone, which is what its documentation says and is
 * worth confirming for a line that quietly widens if it does not.
 */
export default {
  extends: "../config/lint.config.ts",
  files: ["src/**/*.ts"],
  ignores: ["src/features/internal/assert.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@nestia/e2e",
            importNames: ["TestValidator"],
            message:
              "Assert in features/internal/assert.ts, not TestValidator: two of its assertions pass when the thing they check is missing.",
          },
        ],
      },
    ],
  },
} satisfies ITtscLintConfig;
