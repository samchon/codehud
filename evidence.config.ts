import type { IEvidenceConfig } from "@wrtnlabs/evidence";

/**
 * The workspace evidence graph.
 *
 * The graph lives at the workspace root rather than inside a package because it
 * has to span languages. The pure-TypeScript core is only part of the product:
 * the Rokid adapter has to call an Android AAR and the phone shell has to hold
 * a foreground service, so Kotlin is unavoidable at exactly the layer that is
 * most vendor-specific and least testable. A graph that stopped at TypeScript
 * would exclude the code most likely to drift.
 *
 * Type-aware TypeScript hygiene stays with `@ttsc/lint` in each package's
 * `lint.config.ts`, which owns `evidence/singular`, `evidence/documented`, and
 * `evidence/todo`. This file owns the graph alone.
 */
export default {
  claims: [
    {
      name: "specifications refine requirements",
      type: "markdown",
      root: "docs",
      files: ["specifications/**/*.md"],
      symbol: "h3",
      reference: {
        type: "markdown",
        root: "docs",
        files: ["requirements/**/*.md", "!requirements/README.md"],
        symbol: "h3",
      },
    },
    {
      // Both document layers are references of one claim rather than two
      // claims over the same hosts. Each claim resolves a host's citations
      // only against its own reference population, so splitting them would
      // make every specification citation a dangling target under the
      // requirement claim and the other way round.
      name: "public contracts realize the committed contract",
      type: "typescript",
      files: ["packages/*/src/**/*.ts", "!packages/*/src/**/index.ts"],
      symbol: ["type"],
      reference: [
        {
          type: "markdown",
          root: "docs",
          files: ["requirements/**/*.md", "!requirements/README.md"],
          symbol: "h3",
        },
        {
          type: "markdown",
          root: "docs",
          files: ["specifications/**/*.md", "!specifications/README.md"],
          symbol: "h3",
        },
      ],
    },
  ],
} satisfies IEvidenceConfig;
