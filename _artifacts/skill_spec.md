# @bruno00o/graph skill spec

`@bruno00o/graph` draws typed node and edge graphs in the browser with WebGL2, from plain arrays or live sources, with a framework-agnostic core and thin adapters (React, MapLibre, TanStack DB and Query, Cypher). Its skills ship in the npm package under `skills/`, one directory per skill, and version with the package.

## Domains

| Domain               | Description                                                                | Skills                                            |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| graph-setup          | Data, keys, marks, definition, mounting, instance, states, events, updates | core, react                                       |
| appearance           | How nodes, labels and edges look                                           | styling, edges                                    |
| structure            | Groups, merged and hidden elements, layers, support, paths, free shapes    | groups, multilayer, paths, shapes, editor         |
| placement            | Layouts and positions                                                      | layouts                                           |
| navigation-and-input | View, zoom ranges, selection, gestures, keyboard, advanced states          | view, interaction                                 |
| geography-and-time   | Graphs in a MapLibre map, time windows and the timeline                    | map, time                                         |
| data-integrations    | TanStack DB, TanStack Query, Cypher results, graph files                   | tanstack-db, tanstack-query, cypher, file-formats |
| tools-and-output     | Minimap, legend, lens, anchors, hulls, grid, devtools, PNG and SVG         | tools, export                                     |

## Skill plan

Twenty skills. Every skill other than `core` requires `core` (`editor` also requires `shapes`); `react` is the only framework skill. Whether a skill is written or planned lives in `skill_tree.yaml` (`status: planned`), not here. Batches own disjoint files; see [Batches](#batches).

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
| shapes         | sub-skill         | structure            | shapes     |
| editor         | sub-skill         | structure            | editor     |

Boundaries chosen from developer tasks, not from entry points:

- `core` owns everything a first graph needs, states and events included. `interaction` owns the gesture options and the advanced state styles (`others`, `raise`, `hide`, `label: 'always'`); `core` only introduces them.
- `edges` owns every edge option beyond `source`, `target` and a basic `arrow`, plus bundling, routing and bridges. Edge labels belong to `edges`; node labels to `styling`.
- `view` owns zoom ranges (`minZoom`, `maxZoom` on marks) because they are read against the view.
- `time` owns the timeline companion; `tools` owns the minimap, legend, lens, anchors, hulls, background grid and devtools.
- `map` owns `exportMapPng`; `export` owns `exportPng` and `exportSvg`.
- `paths` sits in batch C to balance the batches; it reads the same data as the integrations and has no file in common with them.
- `shapes` owns the `shapes()` mark, its geometry, `pick`, its states by kind and everything that only concerns shapes; the other skills carry the sentences where a shape changes their rules (targets and selection in `interaction`, `fit` in `view`, the two tokens in `styling`) and point to it. Hulls and anchors stay in `tools`, group containers in `groups`.
- `editor` owns the shape editor (`/editor`, `/editor/react`), `applyShapeEdits`, and `persistShapes` and `showPresence` of `/db`. `tanstack-db` names them and points to it; `shapes`, `interaction` and `map` carry one sentence where an editor changes their gestures.

## Failure mode inventory

### core (13)

| #   | Mistake                                               | Priority | Source                                     | Cross-skill |
| --- | ----------------------------------------------------- | -------- | ------------------------------------------ | ----------- |
| 1   | Changing the data array or items in place             | HIGH     | data guide, `src/core/source-table.ts`     | react       |
| 2   | Constant CSS color passed to the color channel        | HIGH     | marks guide                                | styling     |
| 3   | Container without a height                            | HIGH     | installation guide                         | react       |
| 4   | Selection changed through `graph.states`              | MEDIUM   | `src/types.ts`, states guide               | interaction |
| 5   | Item type written on the mark call                    | MEDIUM   | TypeScript guide                           |             |
| 6   | New option functions on every update                  | MEDIUM   | data guide                                 | react       |
| 7   | Laying out or fitting before live data has loaded     | HIGH     | data guide, `src/host/data-status.ts`      |             |
| 8   | Waiting edges taken for a bug                         | MEDIUM   | data guide                                 |             |
| 9   | A function that reads data outside the item           | MEDIUM   | data guide, `graph-instance.ts`            | react       |
| 10  | Destroying and mounting graphs again to save contexts | MEDIUM   | graph instance API, browser-support guide  | react       |
| 11  | Passing `suspended` to `update`                       | MEDIUM   | `src/host/graph-instance.ts`, mount API    |             |
| 12  | Waiting for a lost context to come back by itself     | MEDIUM   | `src/host/render-host.ts`, browser-support |             |
| 13  | A blurry graph when WebGL runs in software            | MEDIUM   | defineGraph API, browser-support guide     | export      |

### react (9)

| #   | Mistake                                            | Priority | Source                                       | Cross-skill       |
| --- | -------------------------------------------------- | -------- | -------------------------------------------- | ----------------- |
| 1   | Definition or option functions created in render   | HIGH     | React guide                                  | core              |
| 2   | Hooks outside `<Graph>` without the `graph` option | HIGH     | React guide, `src/react/index.tsx`           |                   |
| 3   | Object selector without `shallow`                  | HIGH     | React guide                                  |                   |
| 4   | Untyped selectors inside `<Graph>`                 | MEDIUM   | TypeScript guide                             |                   |
| 5   | Graph structure read during render                 | MEDIUM   | `src/host/mount-graph.ts` (`flushPending`)   |                   |
| 6   | Controlled prop set after mount                    | MEDIUM   | React guide                                  | view, interaction |
| 7   | `initialPositions` given an iterator               | MEDIUM   | React and positions guides                   | layouts           |
| 8   | Swapping `<Graph>` for `<MapGraph>` to change side | MEDIUM   | React guide, `src/react/graph.tsx`           | map               |
| 9   | Unmounting the graphs out of sight                 | MEDIUM   | `graph-component` API, `src/react/graph.tsx` | core              |

### shapes (13)

| #   | Mistake                                                | Priority | Source                             | Cross-skill |
| --- | ------------------------------------------------------ | -------- | ---------------------------------- | ----------- |
| 1   | Importing `shapes` from the main entry                 | HIGH     | shapes API, `src/shapes/index.ts`  |             |
| 2   | A decorative zone that swallows the pointer            | HIGH     | shapes guide, `src/shapes/pick.ts` | interaction |
| 3   | Mixing degrees and world units                         | HIGH     | shapes guide, `src/core/geo.ts`    | map         |
| 4   | A pin that pins nothing                                | HIGH     | `src/core/shape-store.ts`          |             |
| 5   | Label options without a text                           | HIGH     | `src/types.ts`, shapes guide       | styling     |
| 6   | Reading shape counts or keys without a shape mark      | MEDIUM   | `graph-instance.ts`, `events.ts`   | core        |
| 7   | Treating every target that is not a node as an edge    | MEDIUM   | `events.ts`, TypeScript guide      | interaction |
| 8   | Coordinates typed as `number[][]`                      | MEDIUM   | `src/types.ts`                     |             |
| 9   | A state for nodes that also dims the zones             | MEDIUM   | shapes and states guides           | interaction |
| 10  | Changing a shape in place                              | MEDIUM   | `src/core/shape-store.ts`          | core        |
| 11  | Using a field name as a color                          | MEDIUM   | `src/types.ts`                     | core        |
| 12  | Looking for a waiting shape in `count()` or `issues()` | MEDIUM   | `data-reads.ts`, shapes guide      |             |
| 13  | World-unit shapes on a map                             | MEDIUM   | `src/shapes/read.ts`, map guide    | map         |

### editor (16)

| #   | Mistake                                                | Priority | Source                                  | Cross-skill |
| --- | ------------------------------------------------------ | -------- | --------------------------------------- | ----------- |
| 1   | Creating the editor without its layer                  | HIGH     | editor API, `src/editor/view.ts`        |             |
| 2   | Writing the edits without updating the graph           | HIGH     | editing shapes guide                    | core        |
| 3   | Changing the items in place                            | HIGH     | `src/editor/edits.ts`                   | shapes      |
| 4   | Two editors on one graph                               | HIGH     | `src/editor/editor.ts`, ShapeEditor API | react       |
| 5   | Listing a mark without a name in `marks`               | HIGH     | `src/editor/edits.ts`                   |             |
| 6   | Applying every edit to one array                       | HIGH     | `src/editor/edits.ts`                   |             |
| 7   | Saving drawn shapes without `create`                   | HIGH     | `src/db/persist-shapes.ts`              | tanstack-db |
| 8   | Handling the edits twice                               | MEDIUM   | `src/editor/editor.ts`                  |             |
| 9   | A writer of your own that writes only the geometry     | MEDIUM   | `src/editor/edits.ts`                   | tanstack-db |
| 10  | `raise` and `lower` on a mark that does not read order | MEDIUM   | editing shapes guide                    | shapes      |
| 11  | Text on a mark without a matching `label`              | MEDIUM   | `src/editor/text.ts`                    | shapes      |
| 12  | Snapping to the background without a background grid   | MEDIUM   | `src/editor/editor.ts`                  | tools       |
| 13  | Keys that never reach the editor                       | MEDIUM   | editing shapes guide                    | interaction |
| 14  | Selections of others that never show                   | MEDIUM   | `src/db/presence.ts`                    | interaction |
| 15  | Cursors that land in different places or surfaces      | MEDIUM   | showPresence API                        | layouts     |
| 16  | Editing a shape that is hidden                         | MEDIUM   | `src/editor/editor.ts`                  | tools       |

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

##### layouts (11)

| #   | Mistake                                              | Priority | Source                            | Cross-skill |
| --- | ---------------------------------------------------- | -------- | --------------------------------- | ----------- |
| 1   | Importing `force` from the layouts entry point       | HIGH     | layout guide, force API           |             |
| 2   | Expecting a layout to move nodes that have `x`, `y`  | HIGH     | layout and positions guides       | core        |
| 3   | Running a layout on a map                            | HIGH     | map guide, `layout-session.ts`    | map         |
| 4   | `grid` or `rings` with `order` inside `defineGraph`  | MEDIUM   | TypeScript guide, layouts API     |             |
| 5   | Expecting an instant layout to be incremental        | MEDIUM   | layouts API                       |             |
| 6   | Writing positions back on every drag move            | MEDIUM   | positions guide                   |             |
| 7   | Restoring positions with `positions.set` after mount | MEDIUM   | positions guide                   | react, map  |
| 8   | `rank` inside `defineGraph` without the item type    | MEDIUM   | layouts API                       |             |
| 9   | Laying out a subset next to anchors                  | MEDIUM   | layout guide, graph API           | core        |
| 10  | Expecting `layout.compute` to move nodes             | MEDIUM   | layout guide, `layout-session.ts` | core        |
| 11  | A group layout with a new function option per render | MEDIUM   | layout guide, nodes API           | react       |

##### edges (12)

| #   | Mistake                                                         | Priority | Source                        | Cross-skill   |
| --- | --------------------------------------------------------------- | -------- | ----------------------------- | ------------- |
| 1   | Setting `bundling` and `routing` together                       | HIGH     | bundling and routing guides   |               |
| 2   | Importing bundling or routing from the main entry               | HIGH     | bundling and routing APIs     |               |
| 3   | Expecting waypoints, geodesic edges or loops to bundle or route | HIGH     | bundling and marks guides     | map           |
| 4   | Passing a constant color to `color`                             | MEDIUM   | marks guide                   | core, styling |
| 5   | Expecting a state to style one end of an edge                   | MEDIUM   | marks guide                   | interaction   |
| 6   | Expecting bundles or routes immediately                         | MEDIUM   | bundling and routing guides   |               |
| 7   | Edge labels that never show                                     | MEDIUM   | labels guide                  | styling       |
| 8   | Expecting `minWidth` to act without `'shrink'`                  | MEDIUM   | marks guide, `width-scale.ts` |               |
| 9   | Expecting `minWidth` to widen a thin line                       | MEDIUM   | marks guide, `width-scale.ts` | styling       |
| 10  | Expecting `widthScale` to do something on a map                 | MEDIUM   | marks guide                   | map           |
| 11  | Expecting the halo to shrink with the line                      | MEDIUM   | marks guide                   | interaction   |
| 12  | Looking for `widthScale` on nodes, or giving it a wrong value   | MEDIUM   | marks guide, `width-scale.ts` | styling       |

##### groups (10)

| #   | Mistake                                         | Priority | Source                                          | Cross-skill |
| --- | ----------------------------------------------- | -------- | ----------------------------------------------- | ----------- |
| 1   | Setting `halves` without `directed: false`      | HIGH     | transformations guide, `src/core/projection.ts` |             |
| 2   | Passing a string to `fold`, `unfold` or `set`   | HIGH     | `graph-instance.ts`                             |             |
| 3   | Building the key of a `groups()` node by hand   | HIGH     | transformations guide, groups API               |             |
| 4   | Expecting folding or merging to relayout        | HIGH     | transformations guide                           | layouts     |
| 5   | Switching to a controlled `folded` after mount  | MEDIUM   | groups guide                                    | react       |
| 6   | Rebuilding `by` functions in render             | MEDIUM   | groups API                                      | core, react |
| 7   | Using `hide` to shrink the layout               | MEDIUM   | transformations guide                           | layouts     |
| 8   | Expecting merged edges across marks             | MEDIUM   | transformations guide                           | multilayer  |
| 9   | Identifying an aggregated edge by its first key | MEDIUM   | groups and transformations guides               | interaction |
| 10  | Expecting `foldedAsOne` to merge without `by`   | MEDIUM   | transformations guide, `src/core/projection.ts` |             |

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

Written: view, interaction, map, time (library 0.22.0, commit d906a46). Each skill requires core, stays under 410 lines, and has typechecked examples, including one `expect-error` fence per skill (`view`: TS2559, `interaction`: TS2353, `map`: TS2353, `time`: TS2769).

Decisions:

- `view` owns `minZoom` and `maxZoom` of marks next to the view limits, and says plainly that they are two different things with the same unit. It owns the controlled view; the React side is one pointer to the react skill, which already shows controlled props.
- `interaction` owns the gesture options, the selection and its controlled mode, pointer events and targets, keyboard and focus, and the advanced state styles. Plain states and `graph.on` basics stay in core; `interaction.lens` is only named, the lens belongs to tools.
- `map` documents the whole adapter in one file, including `<MapGraph>`, waypoints, geodesic edges and `exportMapPng`, because these tasks start from one mounted map graph. The MapLibre worker URL fragment is `no-check` (a Vite `?worker&url` import has no types outside Vite).
- `time` owns the `time` channel, the window, the fade, the controlled window and the whole timeline (store, actions, default renderer, React component and hook).
- No `references/` files: no skill needed to leave its entry point.

Failure mode inventory:

| Skill       | Mistakes | HIGH | Notes                                                                                                    |
| ----------- | -------- | ---- | -------------------------------------------------------------------------------------------------------- |
| view        | 10       | 3    | `fit` with a list, uncontrolled `update({ view })`, unanswered controlled view                           |
| interaction | 12       | 2    | lasso needs two options, unanswered controlled selection, per-node drag                                  |
| map         | 15       | 3    | layout on a map, teardown order, view options on a map graph, snapshots, `spread`, Tailwind v4 utilities |
| time        | 18       | 5    | string times, exclusive ends, an empty list of periods, a history built in render                        |

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
| tanstack-db    | 473   | 10            | key option on a live mark, wrong field in where |
| tanstack-query | 425   | 7             | types not inferred from a plain object          |
| cypher         | 264   | 6             | untyped properties, edge mark without ends      |
| file-formats   | 318   | 9             | color literal, a Response instead of text       |
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

### Shapes

Written for 0.25.0: the `shapes` skill (11 failure modes, five `expect-error` fences: TS2305 for the main entry, TS2769 for `label` and for coordinates typed `number[][]`, TS2339 for `count().shapes` without a shape mark and for `target.endpoints` on an untyped instance). Aligned for 0.25.0: `core`, `interaction`, `view`, `styling`, `export`, `multilayer`, `time`, `tools`, `map`; their failure mode counts are unchanged.

Aligned for 0.26.0 (shapes on maps, labels, pins): `shapes` has 13 failure modes and two reference files (`references/labels-and-pins.md`, `references/maps.md`, declared in `skill_tree.yaml`). Dropped: the two modes that said shapes have no labels and are not drawn on a map. Added: a pin that pins nothing, label options without a text (`expect-error=TS2769`, the fence that used to say the option did not exist), a waiting shape looked for in `count().shapes` or `issues()`, world-unit shapes on a map. `map` gained a section on areas and lost its claim that shapes are not drawn; `export`, `interaction`, `styling` and `view` were aligned. Their failure mode counts are unchanged.

- `shapes` owns the mark and everything specific to it. Each other skill got the sentences where a shape changes its rules and a pointer to `shapes`.
- Tension: `others` crosses kinds, so a state of nodes dims the zones too (`interaction`, `shapes`); by-kind styles decide which kinds fade.
- Cross-references proposed for the shared tables: `shapes` to `interaction` (targets, selection, lasso, states), `shapes` to `tools` (hulls and anchors follow nodes, shapes do not), `shapes` to `view` (`fit`, zoom ranges), `shapes` to `map` (areas on a map), `tools` to `shapes`.
- The timeline reads nodes and edges only: the times of shapes do not enter its extent or histogram (`time`).

### Editor

Written for 0.27.0: the `editor` skill (15 failure modes, requires `core` and `shapes`, references `references/persistence.md` and `references/presence.md`), with typechecked examples and two `expect-error` fences (TS2322 for a mark without a name in `marks`, TS2322 for a `ShapeGeometry` assigned to a TanStack DB draft; since 0.27.1 the fence annotates `edit: ShapeEdit`, and an `onEdit` that infers the edits compiles without a cast). Entry written by hand in `skill_tree.yaml`, then `maintainer sync`.

Aligned for 0.27.0 (shape colors, legend and minimap, editor, text in shapes): `shapes` (the `color` channel and its scale, label options `wrap`, `scale` and `place` in `references/labels-and-pins.md`, pointers to `editor`, its claim that shapes are not in the legend or the minimap removed), `tools` (shapes in the legend and the minimap, `maxShapePoints`), `styling` (the `color` scale across nodes, edges and shapes, `ShapeScalesOptions`), `tanstack-db` (pointers to `persistShapes` and `showPresence`), `interaction` and `map` (one sentence each on the gestures of an editor). Failure modes: `tools` 10 (added: a switch over legend looks without `case 'shapes'`, `expect-error=TS2322`; recorded: the `corner: null` minimap, already in the skill), `styling` 10 and `tanstack-db` 8 (recorded: two modes each that the skills already had and `domain_map.yaml` missed). Counts of `shapes`, `interaction` and `map` are unchanged.

Aligned for 0.27.1 (globe anchors and previews, writable geometry, snap warning, wrapper position, zoom speed): no failure mode added or removed. `editor` keeps 15: the snap mode now says a development build warns once and a map has no grid; new sentences on `WritableShapeGeometry` (edits write to a TanStack DB draft without a cast, `persistence.md` already shows it), the tool that stays active after each shape, Escape that commits a text box, `datum` as a union with several shape marks (narrow with `in`, a block in `references/persistence.md`), local storage collections for two tabs (`persistence.md`, `presence.md`) and the globe. `map` (where `graph.element` sits and stacks, `units` on a map, anchors and world-unit shapes on the globe), `react` (the wrapper keeps the position of `className` or `style`, `onContextMenu` and the browser menu), `core` (`mountGraph` never styles the container, `issues()` and `count()` fresh without a frame), `interaction` (zoom speed formula, `contextmenu`), `groups` (aggregated edges read again, `foldchange` after the data is applied), `tools` (shape labels in the devtools, anchors on the globe, `preventDefault` in the menu example).

- Tension: the editor proposes and the application writes; an edit the data does not take ends in `editlost` after `hold`, whether the write failed or was never made (`editor`, `core`, `tanstack-db`).
- Cross-references proposed for the shared tables: `shapes` to `editor` (drawing and editing), `editor` to `shapes` (marks, labels, units), `editor` to `tanstack-db` (collections), `tanstack-db` to `editor` (`persistShapes`, `showPresence`), `tools` to `shapes` (legend and minimap of shapes).

### Aligned for 0.28.0

Layouts, export, positions, lasso, badges and halos, node order, restored positions, reads of what is drawn, aggregated edge ids (PRs 192 to 200). Failure modes added: `core` (a function that reads data outside the item, `graph.refresh`), `react` (an `initialPositions` iterator that StrictMode consumes), `layouts` (four: restoring with `positions.set`, `rank` without the item type, a subset laid out next to anchors, `layout.compute` that moves nothing), `groups` (an aggregated edge identified by its first key), `interaction` (pinning some nodes with `interaction.drag`; the lasso mode now names `LassoOptions`), `map` (a snapshot given to the other surface), `tanstack-db` (world units written into rows that hold degrees), `export` (`zoom` with `size`), `styling` (large nodes covering small ones). The `in` workaround for `datum` in `editor` is gone: `ShapeEdit<M>` narrows by `mark` and `persistShapes({ mark })` types `create`, so `editor` keeps 15 modes and its sentences on `canRaise`, `canLower` and the narrowing changed. `core` gained `references/live-data.md` (the loading overlay moved out to leave room), and its description of the instance now lists `shown`, `isShown`, `refresh`, `drawsOnMap`, `positions.reset` and `layout.compute`. A badge hides while the pill is under `minSize` pixels high, not while the node is under 10 pixels: the old sentence of `styling` was wrong before this release.

Cross-references proposed for the shared tables: `layouts` to `react` and `map` (restoring positions), `groups` to `interaction` (`aggregate.id` in targets), `styling` to `map` (`order` at a shared place).

### Aligned for 0.29.0

Surfaces, group layouts, events on the timeline, hull labels, folded-group merge (PRs 202 to 214). Failure modes added: `map` (three: `display: none` on the map element, a graph moved with the definition of the other side, a second graph on one surface; the three older modes about layouts, views, snapshots and the minimap or lens now say "while the graph is on a map"), `layouts` (a group layout with a new function option on every render; the map mode now says layouts run again on the canvas), `groups` (`foldedAsOne` without `by`), `time` (two: `events` rebuilt in render, `graph: null` where `graph: false` was meant), `react` (swapping `<Graph>` for `<MapGraph>` to change side), `tools` (a hull label function without `by`, `expect-error=TS2769`; the minimap and lens mode now says the companions come back on the canvas), `view` (the view of one surface given to the other), `tanstack-db` (both surfaces written into the same fields). `editor` keeps 15 (the presence cursor mode now covers the surface). `core`, `edges` and `export` change sentences only.

- New references: `map/references/surfaces.md` (the canvas and map recipes, vanilla and React), `layouts/references/group-layouts.md` and `references/saving-arrangements.md`, `tools/references/hulls.md` (hull targets, options and labels, moved out of the skill to leave room).
- `layouts` and `map` lost their claims that a layout needs a built-in factory first and that a graph cannot move to a map without remounting; `tools` lost the claim that the minimap is inert on a map for good; `time` lost the claim that the timeline needs a graph and counts nodes and edges only; `react` lost the claim that a map always means `<MapGraph>`.
- Tension: a graph that moves between surfaces keeps one definition for each side and applies both in one `update` (`map`, `react`, `view`, `tanstack-db`).
- Cross-references proposed for the shared tables: `map` to `react` (`<Graph surface>`), `map` to `tanstack-db` (`persistPositions({ surfaces })`), `layouts` to `groups` (`container.layout`), `time` to `react` (`graph: false`, `<Timeline timeline>`), `tools` to `map` (companions that follow a surface).

### Aligned for 0.29.0, values over time

`historyFrom`, the `history` option, `graph.history` and the scales over the whole journal (PRs 215 and 217). Failure modes added: `time` (five: a history built in render, `history` on `groups()` with `expect-error=TS2353`, a history that `historyFrom` did not make, expecting the scales to follow the moment, a wide jump over a large journal; the skill passes from 10 to 15) and `tools` (one: assuming that a listed legend category has elements; 11 to 12). `time` gained `references/history.md` (scales, legend, live entries, React, costs) and `tanstack-db` gained `references/journal.md` (a collection of changes as the history of a mark), both declared by hand in `skill_tree.yaml`. `core` (copy of the item at the read moment, `graph.history`, the `TypeError` for a hand-made history), `react` (make the history once, `graph.history.of` not during render), `tanstack-db` and `styling` (category order over the whole journal) change sentences only; their counts are unchanged.

- Cross-references proposed for the shared tables: `time` to `tanstack-db` (a collection as the journal), `time` to `tools` (legend counts of zero, `empty`), `time` to `styling` (category order).
- Docs corrected by the same pull request: the guide and API pages `map` on `update({ view })` given with a `surface`, `onSurfaceChange` in the `react` guide and the `graph-component` page, the legend page on categories of a history, the `scales` guide on marks with a history, and the API `map` page on the minimap and layout when the graph returns to its canvas.

### Aligned for 0.30.0

Suspension, lost contexts, the pixel ratio and software rendering, legend entries, `spread` and the placement near placed nodes, several periods and presence in a journal (PRs 220 to 227). Failure modes added: `core` (four: destroying and mounting graphs again to save contexts, `suspended` passed to `update` with `expect-error=TS2353`, waiting for a lost context to come back, a blurry graph drawn in software; 9 to 13), `react` (unmounting the graphs out of sight; 8 to 9), `tools` (three: rules of legend entries made in render, a swatch that does not match the graph with `expect-error=TS2353`, a `LegendState` built by hand without `entries`; 12 to 15), `styling` (a legend that cannot explain colors set by rules; 11 to 12), `time` (three: an empty list where no time was meant, one period from the first start to the last end, a journal of presences without `present` with `expect-error=TS2769`; 15 to 18), `map` (two: expecting `spread` to move nodes that only overlap, expecting a node without coordinates to follow the zoom; 12 to 14), `file-formats` (reading only `time` from elements of several spells; 8 to 9), `export` (a blurry PNG from a graph drawn in software; 7 to 8). `groups` and `tanstack-db` change sentences only.

- New references: `core/references/rendering.md` (suspension, contexts the browser takes, the pixel ratio and software rendering), `tools/references/legend-entries.md` (entries declared by the application), `time/references/events.md` (events of the application and the moment, moved out of the skill to leave room for several periods). `core/references/live-data.md` gained a live source of your own, `time/references/history.md` the entries that say when an element is there, `tanstack-db/references/journal.md` a collection of presences; all declared by hand in `skill_tree.yaml`.
- `file-formats` lost its claim that `defineGraph({ time })` sets a window (it only takes `{ fade }`); `export` lost its claim that the PNG takes the device pixel ratio by default (it takes the ratio the graph draws at); `map` now says a node without coordinates and without a placed neighbor starts next to a placed node, not on a spiral.
- The gap on browser support narrowed to WebGL2 limits and capacity fallbacks.
- Cross-references proposed for the shared tables: `core` to `react` (the `suspended` and `keepFrame` props), `core` to `export` (the pixel ratio of a graph drawn in software), `styling` to `tools` (legend entries for colors set by rules), `time` to `file-formats` (GEXF spells), `map` to `groups` (`spread` against `container.spread`).
- Docs corrected by the same pull request: the `react` guide and the `graph-component` page (a `<Graph>` without a height in the examples of many graphs on a page), the `time` guide (a block that used `links` without declaring them), the `export` guide (the default pixel ratio).

### Aligned for 0.31.0

The glide of a mouse wheel (PR 230). Failure modes added: `interaction` (two, 10 to 12: a `wheelGlide` that is not a number with `expect-error=TS2322`, the view read right after a notch), `view` (two, 8 to 10: requests of a controlled view answered late, the view saved on every `'user'` change). `interaction` gained `references/wheel-glide.md` (what counts as a notch, Firefox on macOS, what stops a glide, reduced motion and slow frames, reading the view), declared by hand in `skill_tree.yaml`. No other skill changes.

- Docs corrected by the same pull request: the `interaction` guide (a key that moves the view stops a glide; Shift + arrows did not until the next pull request fixed it) and the `view` guide (a glide fires `viewchange` on every frame, with origin `'user'`).

### Aligned for 0.31.1

Fixes of the 0.31 code review (PRs 235, 236, 238, 239, 240, 241). Failure modes added: `editor` (one, 15 to 16: a shape hidden by a layer, the time window, a zoom range or a `hide` state is not edited). Sentences corrected: `editor` (an `'add'` with an existing key replaces the item, `hold` past 2^31 - 1 ms waits for good, hidden shapes leave `state.selected`, presence pacing on a monotonic clock), `shapes` (the lasso takes painted shapes only), `export` (curved and great-circle edges in the frame, hulls of the export's own window and zoom, positions read once, no editor drafts, ratio of a suspended graph), `tools` and `core` (a lens set at a point stays through a suspension, a lost context stops only the drawing), `time` (controlled requests start from the last unanswered one), `layouts` (a layout that throws ends the run without rejecting, `layers({ rank })` wants few distinct values), `view` and `interaction` (a move made during the first layout stops its framing at once, auto-pan under a wheel glide). No reference added.

### Aligned for 0.32.0

Widths that shrink when zooming out (PR 244). Failure modes added: `edges` (five, 7 to 12: `minWidth` without `'shrink'`, `minWidth` to widen a thin line, `widthScale` on a map, a halo that does not shrink, `widthScale` on nodes or with an unknown value, the last with two `expect-error=TS2769` fences). Sentences corrected: `styling` (edge widths and shape outlines are in pixels unless the mark shrinks), `shapes` (`strokeWidth`, `widthScale`, `minWidth`, picking on the drawn width), `export` (an export zoom below 1 narrows marks that shrink), `map` (no shrinking from map zoom 0). No reference added.

- Code against docs: the guide says `minWidth: 0` lets a width follow the zoom all the way, but the edge shaders and the SVG export floor the drawn width at 0.5 pixel (already so before the option), so on edges `minWidth` under 0.5 acts as 0.5; shapes have no floor. The skill follows the code.

## Coverage and batch history

- 0.22.0, foundation: Intent 0.5.6 set up (single package, records in `_artifacts/`), CI workflow, packaging, consumer docs page `agent-skills`, full plan of eighteen skills, and the `core` and `react` skills written from `src/` and the docs at commit 651f9b7. Both skills pass `intent validate` with typechecked examples, including four `expect-error` fences. Fresh consumer and discovery checks are recorded in the review state evidence. Before merge, the pull request gate moved to validation only, with the source review before each release.
