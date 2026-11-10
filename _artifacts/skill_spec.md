# @bruno00o/graph skill spec

`@bruno00o/graph` draws typed node and edge graphs in the browser with WebGL2, from plain arrays or live sources, with a framework-agnostic core and thin adapters (React, MapLibre, TanStack DB and Query, Cypher). Its skills ship in the npm package under `skills/`, one directory per skill, and version with the package.

## Domains

| Domain               | Description                                                                | Skills                                            |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| graph-setup          | Data, keys, marks, definition, mounting, instance, states, events, updates | core, react                                       |
| appearance           | How nodes, labels and edges look                                           | styling, edges                                    |
| structure            | Groups, merged and hidden elements, layers, support, paths                 | groups, multilayer, paths                         |
| placement            | Layouts and positions                                                      | layouts                                           |
| navigation-and-input | View, zoom ranges, selection, gestures, keyboard, advanced states          | view, interaction                                 |
| geography-and-time   | Graphs in a MapLibre map, time windows and the timeline                    | map, time                                         |
| data-integrations    | TanStack DB, TanStack Query, Cypher results, graph files                   | tanstack-db, tanstack-query, cypher, file-formats |
| tools-and-output     | Minimap, legend, lens, anchors, hulls, grid, devtools, PNG and SVG         | tools, export                                     |

## Skill plan

Eighteen skills. Every skill other than `core` requires `core`; `react` is the only framework skill. Whether a skill is written or planned lives in `skill_tree.yaml` (`status: planned`), not here. Batches own disjoint files; see [Batches](#batches).

| Skill          | Type              | Domain               | Owner      |
| -------------- | ----------------- | -------------------- | ---------- |
| core           | core              | graph-setup          | foundation |
| react          | framework (react) | graph-setup          | foundation |
| layouts        | sub-skill         | placement            | batch A    |
| edges          | sub-skill         | appearance           | batch A    |
| groups         | sub-skill         | structure            | batch A    |
| multilayer     | sub-skill         | structure            | batch A    |
| view           | sub-skill         | navigation-and-input | batch B    |
| interaction    | sub-skill         | navigation-and-input | batch B    |
| map            | composition       | geography-and-time   | batch B    |
| time           | sub-skill         | geography-and-time   | batch B    |
| tanstack-db    | composition       | data-integrations    | batch C    |
| tanstack-query | composition       | data-integrations    | batch C    |
| cypher         | composition       | data-integrations    | batch C    |
| file-formats   | sub-skill         | data-integrations    | batch C    |
| paths          | sub-skill         | structure            | batch C    |
| styling        | sub-skill         | appearance           | batch D    |
| tools          | sub-skill         | tools-and-output     | batch D    |
| export         | sub-skill         | tools-and-output     | batch D    |

Boundaries chosen from developer tasks, not from entry points:

- `core` owns everything a first graph needs, states and events included. `interaction` owns the gesture options and the advanced state styles (`others`, `raise`, `hide`, `label: 'always'`); `core` only introduces them.
- `edges` owns every edge option beyond `source`, `target` and a basic `arrow`, plus bundling, routing and bridges. Edge labels belong to `edges`; node labels to `styling`.
- `view` owns zoom ranges (`minZoom`, `maxZoom` on marks) because they are read against the view.
- `time` owns the timeline companion; `tools` owns the minimap, legend, lens, anchors, hulls, background grid and devtools.
- `map` owns `exportMapPng`; `export` owns `exportPng` and `exportSvg`.
- `paths` sits in batch C to balance the batches; it reads the same data as the integrations and has no file in common with them.

## Failure mode inventory

### core (7)

| #   | Mistake                                        | Priority | Source                                 | Cross-skill |
| --- | ---------------------------------------------- | -------- | -------------------------------------- | ----------- |
| 1   | Changing the data array or items in place      | HIGH     | data guide, `src/core/source-table.ts` | react       |
| 2   | Constant CSS color passed to the color channel | HIGH     | marks guide                            | styling     |
| 3   | Container without a height                     | HIGH     | installation guide                     | react       |
| 4   | Selection changed through `graph.states`       | MEDIUM   | `src/types.ts`, states guide           | interaction |
| 5   | Item type written on the mark call             | MEDIUM   | TypeScript guide                       |             |
| 6   | New option functions on every update           | MEDIUM   | data guide                             | react       |
| 7   | Waiting edges taken for a bug                  | MEDIUM   | data guide                             |             |

### react (6)

| #   | Mistake                                            | Priority | Source                                     | Cross-skill       |
| --- | -------------------------------------------------- | -------- | ------------------------------------------ | ----------------- |
| 1   | Definition or option functions created in render   | HIGH     | React guide                                | core              |
| 2   | Hooks outside `<Graph>` without the `graph` option | HIGH     | React guide, `src/react/index.tsx`         |                   |
| 3   | Object selector without `shallow`                  | HIGH     | React guide                                |                   |
| 4   | Untyped selectors inside `<Graph>`                 | MEDIUM   | TypeScript guide                           |                   |
| 5   | Graph structure read during render                 | MEDIUM   | `src/host/mount-graph.ts` (`flushPending`) |                   |
| 6   | Controlled prop set after mount                    | MEDIUM   | React guide                                | view, interaction |

## Tensions

| Tension                                       | Skills      | Agent implication                                                                              |
| --------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Rebuilt definitions against stable identities | core, react | Rebuilding the definition in render with inline functions restyles every item on every render. |

## Cross-references

| From  | To    | Reason                                                          |
| ----- | ----- | --------------------------------------------------------------- |
| react | core  | Data, marks, states and the instance API are the same in React. |
| core  | react | React apps render with `<Graph>` instead of `mountGraph`.       |

## Remaining gaps

| Skill | Question                                                             | Status |
| ----- | -------------------------------------------------------------------- | ------ |
| core  | Migration between versions (the `upgrading` page) has no skill.      | open   |
| core  | Browser support, WebGL2 limits and software rendering have no skill. | open   |

## Maintainer decisions

- Skills live in `skills/<name>/SKILL.md` at the package root, published through `files: ["dist", "skills"]`. Planning records live in `_artifacts/` at the repository root (the repository is a pnpm workspace with `docs`), outside the tarball.
- `metadata.library_version` is not written in the repository. `prepublishOnly` runs `intent validate skills --set-version $npm_package_version`, so the published copy carries the released version and no file needs an edit at release time.
- Skill sources are plain paths relative to the package root, listing public entry modules, `src/types.ts` when options are documented, and the guide and API pages. Internal modules are left out unless the guidance depends on their behavior (`src/core/source-table.ts` for identity-based updates).
- `review.ignore` in `skill_tree.yaml` excludes files that carry no library guidance: tests, `src/testing/**`, the examples app, the docs app code (`docs/src/**`), scripts, CI and configuration files. Every other change outside the skill sources is an unmapped change to review.
- Code fences are typechecked by `intent validate` (TypeScript 7 native API, Node 24). Mistakes the types catch are shown in `expect-error=TS<code>` fences; partial snippets that cannot compile use `no-check`. Examples carry no comments, like the rest of the repository.
- Biome formats YAML and Markdown. `skills/**/*.md` is excluded in `biome.json`, because its Markdown formatter rewrites the YAML frontmatter of a skill into Markdown, and so is `.intent`, written by `maintainer review --record`. The planning records stay under Biome (double quotes in YAML, aligned tables); `maintainer sync` keeps the existing quoting.
- Links to the documentation are absolute (`https://bruno00o.github.io/graph/docs/...`); every page also exists as Markdown at the same URL plus `.md`.
- Pull requests only validate: `pnpm verify`, run by the required `verify` job, includes `intent validate skills`, which typechecks every example. No pull request records a review.
- The source review happens once before each release, by the maintainer: `pnpm exec intent maintainer review --base <last tag> --json > .intent/review.json`, skill updates in their own pull request, then the outcomes annotated and recorded with `--record .intent/review.json` in `.intent/review-state.json`, and `intent maintainer check --base <last tag>` passing.
- `.github/workflows/check-skills.yml` only runs the review report on demand (`workflow_dispatch`): a release made by release-please uses `GITHUB_TOKEN` and never triggers other workflows. The file carries no comment, so `intent stale` prints a workflow update notice that is expected.

## Batches

The foundation pre-registered every planned skill in `skill_tree.yaml` and `domain_map.yaml`, in one contiguous block per batch, so parallel batches edit disjoint lines.

| Batch                  | Skills                                                   | Files owned                                                                                                                      |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A, structure and edges | layouts, edges, groups, multilayer                       | `skills/{layouts,edges,groups,multilayer}/**`, their entries in `skill_tree.yaml` and `domain_map.yaml`, section "Batch A" below |
| B, map, time and view  | view, interaction, map, time                             | `skills/{view,interaction,map,time}/**`, their entries, section "Batch B" below                                                  |
| C, data and analysis   | tanstack-db, tanstack-query, cypher, file-formats, paths | `skills/{tanstack-db,tanstack-query,cypher,file-formats,paths}/**`, their entries, section "Batch C" below                       |
| D, tools and exports   | styling, tools, export                                   | `skills/{styling,tools,export}/**`, their entries, section "Batch D" below                                                       |

Rules for every batch:

- Write `skills/<name>/SKILL.md` for each owned entry, then remove `status: planned` from its tree entry and run `pnpm exec intent maintainer sync`. Do not run `maintainer add` on a planned entry: it appends to the shared history list below.
- Edit only the owned entries in `domain_map.yaml` (add `failure_modes`, adjust `tasks` and `covers`) and only the owned section below. Domains, `core`, `react` and the shared tables above stay as they are; propose changes to them in the PR description.
- Before handoff: `pnpm exec intent maintainer sync`, `pnpm exec intent validate skills`, a task check by a fresh agent in a consumer project outside the repository (a packed tarball, fixtures never committed), then `pnpm verify`. `pnpm exec intent maintainer status` must show 0 files to sync and 0 authoring issues; the review items it lists for the new skills are expected.
- Never run `maintainer review --record` and never touch `.intent/review-state.json`: parallel pull requests would conflict on it. The maintainer reviews the new skills with the rest before the release.

### Batch A

Planned.

### Batch B

Planned.

### Batch C

Planned.

### Batch D

Planned.

## Coverage and batch history

- 0.22.0, foundation: Intent 0.5.6 set up (single package, records in `_artifacts/`), CI workflow, packaging, consumer docs page `agent-skills`, full plan of eighteen skills, and the `core` and `react` skills written from `src/` and the docs at commit 651f9b7. Both skills pass `intent validate` with typechecked examples, including four `expect-error` fences. Fresh consumer and discovery checks are recorded in the review state evidence. Before merge, the pull request gate moved to validation only, with the source review before each release.
