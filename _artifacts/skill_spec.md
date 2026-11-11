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

### core (8)

| #   | Mistake                                           | Priority | Source                                 | Cross-skill |
| --- | ------------------------------------------------- | -------- | -------------------------------------- | ----------- |
| 1   | Changing the data array or items in place         | HIGH     | data guide, `src/core/source-table.ts` | react       |
| 2   | Constant CSS color passed to the color channel    | HIGH     | marks guide                            | styling     |
| 3   | Container without a height                        | HIGH     | installation guide                     | react       |
| 4   | Selection changed through `graph.states`          | MEDIUM   | `src/types.ts`, states guide           | interaction |
| 5   | Item type written on the mark call                | MEDIUM   | TypeScript guide                       |             |
| 6   | New option functions on every update              | MEDIUM   | data guide                             | react       |
| 7   | Laying out or fitting before live data has loaded | HIGH     | data guide, `src/host/data-status.ts`  |             |
| 8   | Waiting edges taken for a bug                     | MEDIUM   | data guide                             |             |

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

Written: layouts, edges, groups, multilayer. Each requires `core`, validates with typechecked examples, and keeps to its entry's tasks.

Scope decisions:

- `layouts` owns `graph.layout`, `graph.positions` (move, snapshot, restore), `positionchange` and the custom `Layout` port. Positions from the `x` and `y` channels are introduced there as the thing that always wins over a layout.
- `edges` owns edge labels, flows, `ends`, waypoints, `bundle`, `route` and `bridge`, `densityBundling`, `orthogonalRouting` and `bridges`. It states that parallel edges and loops need no option, and sends `merge` to `groups` and `layer` bands to `multilayer`.
- `groups` owns `parent`, `groups()`, `container`, folding (instance and controlled), `merge`, `aggregate`, `betweenGroups` and the `hide` state.
- `multilayer` owns `layer`, `graph.layers`, `hiddenLayers`, `supportedBy`, `graph.support`, `createSupportFinder`, the `support` states and the drill-down recipe (which uses `hide`, introduced in `groups`).

#### Failure mode inventory

##### layouts (6)

| #   | Mistake                                             | Priority | Source                         | Cross-skill |
| --- | --------------------------------------------------- | -------- | ------------------------------ | ----------- |
| 1   | Importing `force` from the layouts entry point      | HIGH     | layout guide, force API        |             |
| 2   | Expecting a layout to move nodes that have `x`, `y` | HIGH     | layout and positions guides    | core        |
| 3   | Running a layout on a map                           | HIGH     | map guide, `layout-session.ts` | map         |
| 4   | `grid` or `rings` with `order` inside `defineGraph` | MEDIUM   | TypeScript guide, layouts API  |             |
| 5   | Expecting an instant layout to be incremental       | MEDIUM   | layouts API                    |             |
| 6   | Writing positions back on every drag move           | MEDIUM   | positions guide                |             |

##### edges (7)

| #   | Mistake                                                         | Priority | Source                      | Cross-skill   |
| --- | --------------------------------------------------------------- | -------- | --------------------------- | ------------- |
| 1   | Setting `bundling` and `routing` together                       | HIGH     | bundling and routing guides |               |
| 2   | Importing bundling or routing from the main entry               | HIGH     | bundling and routing APIs   |               |
| 3   | Expecting waypoints, geodesic edges or loops to bundle or route | HIGH     | bundling and marks guides   | map           |
| 4   | Passing a constant color to `color`                             | MEDIUM   | marks guide                 | core, styling |
| 5   | Expecting a state to style one end of an edge                   | MEDIUM   | marks guide                 | interaction   |
| 6   | Expecting bundles or routes immediately                         | MEDIUM   | bundling and routing guides |               |
| 7   | Edge labels that never show                                     | MEDIUM   | labels guide                | styling       |

##### groups (8)

| #   | Mistake                                        | Priority | Source                                          | Cross-skill |
| --- | ---------------------------------------------- | -------- | ----------------------------------------------- | ----------- |
| 1   | Setting `halves` without `directed: false`     | HIGH     | transformations guide, `src/core/projection.ts` |             |
| 2   | Passing a string to `fold`, `unfold` or `set`  | HIGH     | `graph-instance.ts`                             |             |
| 3   | Building the key of a `groups()` node by hand  | HIGH     | transformations guide, groups API               |             |
| 4   | Expecting folding or merging to relayout       | HIGH     | transformations guide                           | layouts     |
| 5   | Switching to a controlled `folded` after mount | MEDIUM   | groups guide                                    | react       |
| 6   | Rebuilding `by` functions in render            | MEDIUM   | groups API                                      | core, react |
| 7   | Using `hide` to shrink the layout              | MEDIUM   | transformations guide                           | layouts     |
| 8   | Expecting merged edges across marks            | MEDIUM   | transformations guide                           | multilayer  |

##### multilayer (7)

| #   | Mistake                                             | Priority | Source                        | Cross-skill |
| --- | --------------------------------------------------- | -------- | ----------------------------- | ----------- |
| 1   | Hiding a layer by removing its data                 | HIGH     | multilayer guide              | groups      |
| 2   | Filling the support states yourself                 | HIGH     | multilayer guide              |             |
| 3   | Naming a support state that is not declared         | HIGH     | `define-graph.ts`             |             |
| 4   | Hiding a node layer and expecting its edges to stay | MEDIUM   | multilayer guide              |             |
| 5   | A layer name no mark gives                          | MEDIUM   | multilayer, TypeScript guides | core        |
| 6   | Switching to controlled `hiddenLayers` after mount  | MEDIUM   | multilayer guide              | react       |
| 7   | Walking support with mismatched key types           | MEDIUM   | support API                   |             |

#### Tensions

| Tension                                | Skills             | Agent implication                                                                                 |
| -------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| Positions from data against layouts    | layouts, core      | Giving a mark `x` and `y` pins its nodes, so a layout in the same definition leaves them alone.   |
| Hiding by state against filtering data | groups, multilayer | A `hide` state or a layer keeps elements in layouts and counts; filtering the array removes them. |
| Bundling against routing               | edges              | A definition takes one of them; `bridges` combines with either.                                   |

#### Cross-references

| From       | To         | Reason                                                                   |
| ---------- | ---------- | ------------------------------------------------------------------------ |
| edges      | groups     | `merge` and `aggregate` draw parallel edges as one.                      |
| edges      | multilayer | Edges of different layers form one band per pair of nodes.               |
| groups     | layouts    | A layout keeps unfolded groups whole, and `relayout` runs it again.      |
| multilayer | groups     | The drill-down recipe closes lower edges with a `hide` state.            |
| layouts    | core       | Layout events and the `layout` slice of the store are core instance API. |

### Batch B

Written: view, interaction, map, time (library 0.22.0, commit d906a46). Each skill requires core, stays under 400 lines, and has typechecked examples, including one `expect-error` fence per skill (`view`: TS2559, `interaction`: TS2353, `map`: TS2353, `time`: TS2769).

Decisions:

- `view` owns `minZoom` and `maxZoom` of marks next to the view limits, and says plainly that they are two different things with the same unit. It owns the controlled view; the React side is one pointer to the react skill, which already shows controlled props.
- `interaction` owns the gesture options, the selection and its controlled mode, pointer events and targets, keyboard and focus, and the advanced state styles. Plain states and `graph.on` basics stay in core; `interaction.lens` is only named, the lens belongs to tools.
- `map` documents the whole adapter in one file, including `<MapGraph>`, waypoints, geodesic edges and `exportMapPng`, because these tasks start from one mounted map graph. The MapLibre worker URL fragment is `no-check` (a Vite `?worker&url` import has no types outside Vite).
- `time` owns the `time` channel, the window, the fade, the controlled window and the whole timeline (store, actions, default renderer, React component and hook).
- No `references/` files: no skill needed to leave its entry point.

Failure mode inventory:

| Skill       | Mistakes | HIGH | Notes                                                                          |
| ----------- | -------- | ---- | ------------------------------------------------------------------------------ |
| view        | 7        | 3    | `fit` with a list, uncontrolled `update({ view })`, unanswered controlled view |
| interaction | 9        | 2    | lasso needs two options, unanswered controlled selection                       |
| map         | 8        | 3    | layout on a map, teardown order, view options on a map graph                   |
| time        | 8        | 3    | string times, exclusive ends, controlled window without both props             |

Cross-references proposed for the shared tables (the maintainer applies them after the batches merge):

| From        | To   | Reason                                                                    |
| ----------- | ---- | ------------------------------------------------------------------------- |
| view        | map  | On a map the map owns the camera; view limits and padding do not apply.   |
| interaction | map  | The map owns wheel, pinch and background drag.                            |
| interaction | view | `pan` and `zoom` options against `graph.view`, and the keyboard fit.      |
| map         | time | The time window and `<Timeline>` work on a map graph.                     |
| time        | view | A zoom range and a time window combine: an element shows when both allow. |

Tensions proposed: controlled modes (view, selection, time, folded, layers) are decided at mount in every skill, and `update` on an uncontrolled graph does nothing without an error; the react skill, view, interaction and time all warn about it.

Gaps: `exportMapPng` is documented in `map` only; the `export` skill (batch D) should point to it. The `geo` layout is mentioned in `map` and belongs to the layouts skill (batch A).

### Batch C

Written: `tanstack-db`, `tanstack-query`, `cypher`, `file-formats`, `paths`, all requiring `core`.

| Skill          | Lines | Failure modes | Typechecked failures                            |
| -------------- | ----- | ------------- | ----------------------------------------------- |
| tanstack-db    | 411   | 6             | key option on a live mark, wrong field in where |
| tanstack-query | 425   | 7             | types not inferred from a plain object          |
| cypher         | 264   | 6             | untyped properties, edge mark without ends      |
| file-formats   | 304   | 8             | color literal, a Response instead of text       |
| paths          | 272   | 7             | unknown direction, misspelled weight            |

Decisions:

- The examples never import `neo4j-driver`, which is not a dependency of the package: the one fragment that calls the driver is `no-check`, and everything else starts from a `CypherInput`.
- `tanstack-query` and `cypher` both show `createExploration`, with explicit type arguments for a plain query-options object. The guide says the types are inferred from such an object; they are not (the items are typed `{ readonly id: Key }`), only `queryOptions` of an adapter infers them. The skills follow the types.
- `paths` is registered in the `structure` domain with `groups` and `multilayer`, and refers to the time skill only by its name.
- A written skill never copies an options table: it lists the options that decide a task and links the API page.
- Browser-only behavior is not claimed: the queries, readers and adapters run in Node, so their examples compile and the task checks ran them there.
- Task checks by fresh agents (one per skill, in a consumer project outside the repository) found gaps now covered: read-only result types and optional weights in `paths`, the sentinel root, cleanup order and click against double-click in `tanstack-query`, the update typing limit between a subset and a join in `tanstack-db`, optional fields and style fallbacks in `file-formats`, integer and date conversion in `cypher`.

### Batch D

Written: styling, tools and export, from `src/` and the docs at commit d906a46.

- `styling` owns node and label looks: the three scales and the channel, style and `raw()` rule, label options, shapes and boxes, contours, images, badges and the theme tokens. Edge looks and edge labels stay in `edges`; `core` only introduces `fill` against `color`.
- `tools` owns the minimap, legend, lens, anchors, hulls, background grid and devtools. It states which tools a graph on a map does not have (minimap, lens, background grid) and leaves the React `<Anchor>` to `react`.
- `export` owns `exportPng` and `exportSvg`; `exportMapPng` stays in `map`.
- Failure modes: styling 8, tools 8, export 6, each with an example that compiles under `intent validate`, six of them as `expect-error` fences.
- Gaps found while writing, left to the maintainer: the guide says the `offset` of `anchors.set` shifts by a number of pixels while the type is a `{ x, y }` point, and the SVG export does not read the `geodesic` column of the scene, so great-circle edges are not drawn as arcs.

## Coverage and batch history

- 0.22.0, foundation: Intent 0.5.6 set up (single package, records in `_artifacts/`), CI workflow, packaging, consumer docs page `agent-skills`, full plan of eighteen skills, and the `core` and `react` skills written from `src/` and the docs at commit 651f9b7. Both skills pass `intent validate` with typechecked examples, including four `expect-error` fences. Fresh consumer and discovery checks are recorded in the review state evidence. Before merge, the pull request gate moved to validation only, with the source review before each release.
