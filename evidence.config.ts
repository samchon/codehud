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
      // The generated Codex bindings need no exclusion here, which was checked
      // rather than assumed: deleting one produced no new diagnostic. A host
      // that cites nothing is not an error, only a citation pointing nowhere
      // is, so generated files are simply hosts with nothing to say. What did
      // have to be turned off is the lint rule that demands documentation on
      // every export, and that lives in the package's own lint config.
      files: ["packages/*/src/**/*.ts", "!packages/*/src/**/index.ts"],
      // Properties are hosts too, not only the types that contain them. Some
      // promises live on one field rather than on the shape around it: the
      // harness's own session identifier is the whole of what makes handoff
      // possible, and saying so on the type would spread a precise claim across
      // everything else the type carries.
      //
      // Until this was widened a citation on a property was an error, reported
      // as graph-out-of-scope-host. That was checked by moving one there and
      // reading the diagnostic, which matters: the same move under the old
      // setting also produced one error under the new one, for a different
      // reason, and counting errors rather than reading them said the change
      // did nothing.
      symbol: ["type", "property"],
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
