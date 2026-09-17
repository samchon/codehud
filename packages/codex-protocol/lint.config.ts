import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * Nothing from this repository's own rules applies here.
 *
 * Every file under `src` is emitted by `codex app-server generate-ts` and
 * carries a "DO NOT MODIFY BY HAND" banner. The evidence rules ask each export
 * to document what requirement it realizes, which is a question generated code
 * cannot answer: these types realize nothing this repository promised, they
 * describe what a vendor's binary speaks. The adapter that consumes them is
 * where the citations belong, and it has them.
 *
 * Extending nothing is deliberate. Inheriting the root correctness ruleset would
 * make a vendor's next release able to fail this build for style, and the only
 * available fix would be editing a file that says not to.
 */
export default {
  rules: {},
} satisfies ITtscLintConfig;
