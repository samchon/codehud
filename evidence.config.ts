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
      name: "public contracts realize requirements",
      type: "typescript",
      files: ["packages/*/src/**/*.ts", "!packages/*/src/**/index.ts"],
      symbol: ["type"],
      reference: {
        type: "markdown",
        root: "docs",
        files: ["requirements/**/*.md", "!requirements/README.md"],
        symbol: "h3",
      },
    },
    {
      name: "public contracts realize specifications",
      type: "typescript",
      files: ["packages/*/src/**/*.ts", "!packages/*/src/**/index.ts"],
      symbol: ["type"],
      reference: {
        type: "markdown",
        root: "docs",
        files: ["specifications/**/*.md", "!specifications/README.md"],
        symbol: "h3",
      },
    },
  ],
} satisfies IEvidenceConfig;
