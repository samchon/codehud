import { evidence } from "@ttsc/evidence";
import type { ITtscLintConfig } from "@ttsc/lint";

/**
 * TypeScript hygiene rules for this package.
 *
 * The cross-language evidence graph lives in the workspace root
 * evidence.config.ts and runs through `pnpm run evidence`, because the graph
 * has to span Kotlin as well as TypeScript. What stays here is the part that
 * only a type-aware TypeScript build can enforce: one public identity per
 * file, a documentation block on every export that could carry a citation, and
 * no unrealized `@todo` left behind.
 */
export default {
  extends: "../../config/lint.config.ts",
  plugins: { evidence },
  rules: {
    "evidence/singular": "error",
    "evidence/documented": [
      "error",
      { symbol: ["type", "function", "property"] },
    ],
    "evidence/todo": "error",
  },
} satisfies ITtscLintConfig;
