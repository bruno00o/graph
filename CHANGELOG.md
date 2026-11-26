# Changelog

## [0.37.0](https://github.com/bruno00o/graph/compare/0.36.0...0.37.0) (2026-11-26)


### Features

* let a coding agent read and drive a graph in development ([#296](https://github.com/bruno00o/graph/issues/296)) ([10bf795](https://github.com/bruno00o/graph/commit/10bf7953b360ae7b19d426bcfcf199b425decaab))


### Bug Fixes

* register a graph for the devtools once its internals are ready ([#293](https://github.com/bruno00o/graph/issues/293)) ([6b3b954](https://github.com/bruno00o/graph/commit/6b3b95420809a7439666047e391057021a283ad1))

## [0.36.0](https://github.com/bruno00o/graph/compare/0.35.0...0.36.0) (2026-11-24)


### Features

* find the nodes with two ways out to two exits ([#288](https://github.com/bruno00o/graph/issues/288)) ([94c71cd](https://github.com/bruno00o/graph/commit/94c71cd8edae07500a89a3fd1e0b8d192af2b449))
* lay out chains between exits as rings ([#290](https://github.com/bruno00o/graph/issues/290)) ([c6fe1bd](https://github.com/bruno00o/graph/commit/c6fe1bd19c4c2895432f920555eeacb362533bdd))

## [0.35.0](https://github.com/bruno00o/graph/compare/0.34.0...0.35.0) (2026-11-22)


### Features

* let the neighbors of a dragged node follow it ([#284](https://github.com/bruno00o/graph/issues/284)) ([2f85f2d](https://github.com/bruno00o/graph/commit/2f85f2de56184366a544384630216b2dc294daa7))

## [0.34.0](https://github.com/bruno00o/graph/compare/0.33.0...0.34.0) (2026-11-22)


### ⚠ BREAKING CHANGES

* untangle crossed edges once force settles ([#282](https://github.com/bruno00o/graph/issues/282))
* lay out force runs in levels from 100 moving nodes ([#280](https://github.com/bruno00o/graph/issues/280))
* type theme tokens, give readFont options and accept pixel ratio words in PNG exports ([#273](https://github.com/bruno00o/graph/issues/273))
* mount a graph that draws nothing when webgl2 is missing ([#276](https://github.com/bruno00o/graph/issues/276))
* fail a layout run that throws, abort runs by signal and take any list of roots ([#274](https://github.com/bruno00o/graph/issues/274))
* hide the resolved options of a graph definition ([#277](https://github.com/bruno00o/graph/issues/277))
* return { stop } from persistPositions and persistShapes, and type pendingState by the graph ([#275](https://github.com/bruno00o/graph/issues/275))
* mount the minimap and name event payloads after the store ([#272](https://github.com/bruno00o/graph/issues/272))

### Features

* fail a layout run that throws, abort runs by signal and take any list of roots ([#274](https://github.com/bruno00o/graph/issues/274)) ([4e116d2](https://github.com/bruno00o/graph/commit/4e116d2539684bfb662858ae87a0455efbfc310d))
* hide the resolved options of a graph definition ([#277](https://github.com/bruno00o/graph/issues/277)) ([c742851](https://github.com/bruno00o/graph/commit/c74285145d2e753a3bc8df93de62157a84cd0c2a))
* lay out force runs in levels from 100 moving nodes ([#280](https://github.com/bruno00o/graph/issues/280)) ([0294694](https://github.com/bruno00o/graph/commit/0294694cd7f412668d6228ef2d795e436d1ae8f8))
* mount a graph that draws nothing when webgl2 is missing ([#276](https://github.com/bruno00o/graph/issues/276)) ([0d9d103](https://github.com/bruno00o/graph/commit/0d9d1036f089103ffe49dd19b236aa8f6efa59b5))
* mount the minimap and name event payloads after the store ([#272](https://github.com/bruno00o/graph/issues/272)) ([08b0e9b](https://github.com/bruno00o/graph/commit/08b0e9b5763fb3be2089f639d61377f2a3f42e1f))
* return { stop } from persistPositions and persistShapes, and type pendingState by the graph ([#275](https://github.com/bruno00o/graph/issues/275)) ([13a7b36](https://github.com/bruno00o/graph/commit/13a7b36171cb2edf1612d9c9529bb3129f6a1a3f))
* type theme tokens, give readFont options and accept pixel ratio words in PNG exports ([#273](https://github.com/bruno00o/graph/issues/273)) ([db40df6](https://github.com/bruno00o/graph/commit/db40df6965db7c3183b51df79162be3456ed992f))
* untangle crossed edges once force settles ([#282](https://github.com/bruno00o/graph/issues/282)) ([7d3d122](https://github.com/bruno00o/graph/commit/7d3d1222fc894aea672bf0e4fd07e0c84618e3cd))

## [0.33.0](https://github.com/bruno00o/graph/compare/0.32.0...0.33.0) (2026-11-21)


### Features

* create a graph without a page ([#259](https://github.com/bruno00o/graph/issues/259)) ([5b05581](https://github.com/bruno00o/graph/commit/5b0558124dcb6c0695fb8698c4a7cebcd0d425a7))
* export a graph as an editable draw.io diagram ([#253](https://github.com/bruno00o/graph/issues/253)) ([f7f7be2](https://github.com/bruno00o/graph/commit/f7f7be28c55b26f50d65b9cf976529034fe68d96))
* export a graph as an editable Visio drawing ([#255](https://github.com/bruno00o/graph/issues/255)) ([676d8c3](https://github.com/bruno00o/graph/commit/676d8c36f788f9dc765c69b0173ccd97231ce31d))
* export svg from a graph without a page ([#261](https://github.com/bruno00o/graph/issues/261)) ([d7d168e](https://github.com/bruno00o/graph/commit/d7d168e7cdae9e5b8c9954ae430248c3b8c0d43c))
* read label widths from a font file ([#260](https://github.com/bruno00o/graph/issues/260)) ([60b939f](https://github.com/bruno00o/graph/commit/60b939fe26ed566a2210f0a94dea787a2cb093ee))
* wait until a graph has settled ([#258](https://github.com/bruno00o/graph/issues/258)) ([4777492](https://github.com/bruno00o/graph/commit/4777492a38e22f94f7b080d2372373197b171a09))


### Bug Fixes

* drop null properties from cypher elements and document lean result rows ([#251](https://github.com/bruno00o/graph/issues/251)) ([1530f25](https://github.com/bruno00o/graph/commit/1530f255502f8d7734065ecf4b34376d08066b9d))
* open visio exports in microsoft visio ([#264](https://github.com/bruno00o/graph/issues/264)) ([f9dad7c](https://github.com/bruno00o/graph/commit/f9dad7c5f78a8c7fa46f4a90ff008aeb8a8069eb))
* reserve label space in layers from measured widths ([#257](https://github.com/bruno00o/graph/issues/257)) ([92e86c5](https://github.com/bruno00o/graph/commit/92e86c5379d9b000b29f742df5dcd3f4d87ea338))

## [0.32.0](https://github.com/bruno00o/graph/compare/0.31.1...0.32.0) (2026-11-16)


### Features

* let edge and outline widths shrink when zooming out ([#244](https://github.com/bruno00o/graph/issues/244)) ([f1ba97c](https://github.com/bruno00o/graph/commit/f1ba97c79743845aa3d57a3bdd4a903299fe04b1))

## [0.31.1](https://github.com/bruno00o/graph/compare/0.31.0...0.31.1) (2026-11-15)


### Bug Fixes

* end layout runs whose layout throws and keep compute keys and destroy sound ([#236](https://github.com/bruno00o/graph/issues/236)) ([62930a6](https://github.com/bruno00o/graph/commit/62930a61daa9ed33a0a867e97b4cf1c85571d4af))
* export the frame it measured, with curved edges, its own hulls and shapes at their data ([#240](https://github.com/bruno00o/graph/issues/240)) ([01663bd](https://github.com/bruno00o/graph/commit/01663bdc509dfd140674872c1d94cd48317b2413))
* keep shape edits, hidden shapes and presence timers right ([#238](https://github.com/bruno00o/graph/issues/238)) ([c313141](https://github.com/bruno00o/graph/commit/c31314196a623cd53acf4cc8db003c567a650b96))
* keep the frame work going while the context is lost, resend a time window asked again, and carry auto-pan under a wheel glide ([#241](https://github.com/bruno00o/graph/issues/241)) ([0924d91](https://github.com/bruno00o/graph/commit/0924d91d4f00e22cb70cd5c8cf1a3d77cce59291))
* keep wheel notches and view moves made while the first layout frames the view ([#235](https://github.com/bruno00o/graph/issues/235)) ([378ec4e](https://github.com/bruno00o/graph/commit/378ec4e64cc7f3ec0d8c5cb9bb72b822d4979e6a))
* show history, legend and timeline counts in step with the time window ([#239](https://github.com/bruno00o/graph/issues/239)) ([970ad95](https://github.com/bruno00o/graph/commit/970ad954c10d595abe2e11ecee4e1ef72e6a435a))

## [0.31.0](https://github.com/bruno00o/graph/compare/0.30.0...0.31.0) (2026-11-15)


### Features

* glide the view after each notch of a mouse wheel ([#230](https://github.com/bruno00o/graph/issues/230)) ([b222602](https://github.com/bruno00o/graph/commit/b222602a84377ef4024592e5027b595ee4f7d392))


### Bug Fixes

* stop a wheel glide when the keyboard pans the view ([#233](https://github.com/bruno00o/graph/issues/233)) ([3a03df6](https://github.com/bruno00o/graph/commit/3a03df65efce1b5b2dc0c1380def40ecd3ee7eb3))

## [0.30.0](https://github.com/bruno00o/graph/compare/0.29.0...0.30.0) (2026-11-15)


### Features

* draw faster when webgl runs in software ([#227](https://github.com/bruno00o/graph/issues/227)) ([c7cf90c](https://github.com/bruno00o/graph/commit/c7cf90c2d895f38335dc9d6c3b567010bc50c07a))
* legend entries declared by the application ([#220](https://github.com/bruno00o/graph/issues/220)) ([506529d](https://github.com/bruno00o/graph/commit/506529dabc43c1bfabb0ced664777779274902bd))
* let a suspended graph keep no last frame and let resume bring back a context taken by the browser ([#225](https://github.com/bruno00o/graph/issues/225)) ([8d9ae8a](https://github.com/bruno00o/graph/commit/8d9ae8aa2654c89e5004cf2cbe3f67f6fd5f0ff2))
* show elements over several periods of time ([#226](https://github.com/bruno00o/graph/issues/226)) ([75208a9](https://github.com/bruno00o/graph/commit/75208a93b52465bd14f4afea597c2e5b53c43d8e))
* spread nodes that share a place and start nodes without coordinates near placed ones ([#224](https://github.com/bruno00o/graph/issues/224)) ([8179227](https://github.com/bruno00o/graph/commit/81792275b91f11e8be74263ed533cbb110bd9866))
* suspend a graph without destroying it ([#223](https://github.com/bruno00o/graph/issues/223)) ([981ab9c](https://github.com/bruno00o/graph/commit/981ab9ccea8c2d2e8fe91c643db3202cdfe26e7f))


### Performance Improvements

* rewrite only the look of elements whose values change ([#222](https://github.com/bruno00o/graph/issues/222)) ([ccd17cc](https://github.com/bruno00o/graph/commit/ccd17cc2ba27180a3894898629b85ab8311cdb7e))

## [0.29.0](https://github.com/bruno00o/graph/compare/0.28.0...0.29.0) (2026-11-15)


### Features

* arrange a group as it unfolds ([#207](https://github.com/bruno00o/graph/issues/207)) ([7b02305](https://github.com/bruno00o/graph/commit/7b0230528ec5eec8576a192bb654d8c6adbfc1fd))
* companions follow a graph onto a map and back ([#214](https://github.com/bruno00o/graph/issues/214)) ([24a9d07](https://github.com/bruno00o/graph/commit/24a9d072553b177b340e122a04160d416dc24b34))
* count events of the application on the timeline and point at a moment ([#211](https://github.com/bruno00o/graph/issues/211)) ([09f4ea8](https://github.com/bruno00o/graph/commit/09f4ea8d923e81f3bc32ee6e7d47c10db6bf87af))
* lay out each group with a layout of its own ([#204](https://github.com/bruno00o/graph/issues/204)) ([999cd49](https://github.com/bruno00o/graph/commit/999cd496dd081e679ef04a1f8295f7c37a291c36))
* merge the edges toward a folded group into one whatever the merge value ([#210](https://github.com/bruno00o/graph/issues/210)) ([b8fda0b](https://github.com/bruno00o/graph/commit/b8fda0bcdec77437bd0c049c18c672512282d475))
* move a graph onto a map and back ([#208](https://github.com/bruno00o/graph/issues/208)) ([71b9808](https://github.com/bruno00o/graph/commit/71b98089959b405fe4a27b210d347360337162a3))
* name hulls with labels drawn by the graph ([#212](https://github.com/bruno00o/graph/issues/212)) ([5bf1fab](https://github.com/bruno00o/graph/commit/5bf1fabd06834eac9bb66aa2701a29d0c278727b))
* scales cover the whole history ([#217](https://github.com/bruno00o/graph/issues/217)) ([1660437](https://github.com/bruno00o/graph/commit/16604371b79b30cbe6b3c3815f92b5d0fc02abb7))
* switch surfaces in react ([#213](https://github.com/bruno00o/graph/issues/213)) ([c1c0d57](https://github.com/bruno00o/graph/commit/c1c0d571a60519517e7750c45eb8d3e3dcf9e788))
* values that change over time ([#215](https://github.com/bruno00o/graph/issues/215)) ([b47f58f](https://github.com/bruno00o/graph/commit/b47f58fa848a5fe6889cf28d2ceb8a2d775e8ecc))


### Performance Improvements

* lay out many groups in parallel workers ([#206](https://github.com/bruno00o/graph/issues/206)) ([72febfc](https://github.com/bruno00o/graph/commit/72febfc3102e9d6d058e731f1a44e606937764a3))

## [0.28.0](https://github.com/bruno00o/graph/compare/0.27.1...0.28.0) (2026-11-15)


### Features

* draw icons in badges, color halos per state and order nodes ([#196](https://github.com/bruno00o/graph/issues/196)) ([9008364](https://github.com/bruno00o/graph/commit/90083649c929be05f1cfb7cc3b8a87f3cf983eaa))
* export at an exact size and put moved nodes back ([#193](https://github.com/bruno00o/graph/issues/193)) ([33a5496](https://github.com/bruno00o/graph/commit/33a5496bfe1f426983185c01e0816236e36d8c4f))
* lasso without shift and read what is shown ([#194](https://github.com/bruno00o/graph/issues/194)) ([663e867](https://github.com/bruno00o/graph/commit/663e867c7c71ffc3f54e2ca8d97d99288912d891))
* let layouts see groups that are laid out on their own ([#200](https://github.com/bruno00o/graph/issues/200)) ([d8baafb](https://github.com/bruno00o/graph/commit/d8baafbdc2881c0d8b480919d789181562b4765e))
* restore positions without a layout run ([#198](https://github.com/bruno00o/graph/issues/198)) ([e28d660](https://github.com/bruno00o/graph/commit/e28d6609e3d5a28f873c6f0ba8884383f64307ad))
* take layers from the data, run app positions as a layout and compute layouts without moving nodes ([#192](https://github.com/bruno00o/graph/issues/192)) ([fdbfc63](https://github.com/bruno00o/graph/commit/fdbfc6398918dc42f6de97c9a88aed02a02e8229))

## [0.27.1](https://github.com/bruno00o/graph/compare/0.27.0...0.27.1) (2026-11-14)


### Bug Fixes

* keep the position given by a graph class name ([#191](https://github.com/bruno00o/graph/issues/191)) ([9403f71](https://github.com/bruno00o/graph/commit/9403f716d846d180ae75631571403d0660200323))
* place anchors and shape previews on the globe ([#188](https://github.com/bruno00o/graph/issues/188)) ([5fe8ec0](https://github.com/bruno00o/graph/commit/5fe8ec09b74e5ef2865ddd62d19d8452f3bfb3c3))
* write edited geometry without a cast, warn on a missing snap grid, count shape labels ([#189](https://github.com/bruno00o/graph/issues/189)) ([fd98f1a](https://github.com/bruno00o/graph/commit/fd98f1a4fbf863ec526b0f32a8c642c36ea9b247))

## [0.27.0](https://github.com/bruno00o/graph/compare/0.26.1...0.27.0) (2026-11-14)


### ⚠ BREAKING CHANGES

* color shapes by scale and show them in the legend and minimap ([#178](https://github.com/bruno00o/graph/issues/178))

### Features

* color shapes by scale and show them in the legend and minimap ([#178](https://github.com/bruno00o/graph/issues/178)) ([5610cf2](https://github.com/bruno00o/graph/commit/5610cf218b0a9f2b9911a94b6771ffb41e211fce))
* draw new shapes ([#182](https://github.com/bruno00o/graph/issues/182)) ([6165cf6](https://github.com/bruno00o/graph/commit/6165cf6493d88660e10d69592cb6e315d60ce287))
* move and reshape shapes with the pointer ([#180](https://github.com/bruno00o/graph/issues/180)) ([a73376a](https://github.com/bruno00o/graph/commit/a73376a481c9e4c2788deb7dc90657d91b6ca75f))
* save shape edits to a collection ([#181](https://github.com/bruno00o/graph/issues/181)) ([e7e2903](https://github.com/bruno00o/graph/commit/e7e29039d41715dd0ebf452735ee89c2bffecd4b))
* show who else is editing ([#184](https://github.com/bruno00o/graph/issues/184)) ([88fc60d](https://github.com/bruno00o/graph/commit/88fc60d6428d95b7db26126554c76c40da274203))
* write text in shapes ([#185](https://github.com/bruno00o/graph/issues/185)) ([3e81286](https://github.com/bruno00o/graph/commit/3e8128676a843fa0c55feae8252ea5ced1e93da7))


### Performance Improvements

* keep large shape edits smooth ([#183](https://github.com/bruno00o/graph/issues/183)) ([8af6b98](https://github.com/bruno00o/graph/commit/8af6b98cc786c07e4a93a48d78880082a68f4156))

## [0.26.1](https://github.com/bruno00o/graph/compare/0.26.0...0.26.1) (2026-11-14)


### Bug Fixes

* keep the shapes skill within the line limit once published ([#176](https://github.com/bruno00o/graph/issues/176)) ([c2d82be](https://github.com/bruno00o/graph/commit/c2d82be3c2ced4c895c8fa378c0bc98769fcae3a))

## [0.26.0](https://github.com/bruno00o/graph/compare/0.25.0...0.26.0) (2026-11-14)


### Features

* draw large shape sets smoothly ([#174](https://github.com/bruno00o/graph/issues/174)) ([db45672](https://github.com/bruno00o/graph/commit/db456726ecf61351a2cb0c51ead456241c1afa89))
* draw shapes on maps ([#170](https://github.com/bruno00o/graph/issues/170)) ([cebab67](https://github.com/bruno00o/graph/commit/cebab6718d367c044d2468925e897ed9c87870d0))
* label shapes and pin them to nodes ([#172](https://github.com/bruno00o/graph/issues/172)) ([8f27015](https://github.com/bruno00o/graph/commit/8f27015a2d8ba0458845441b0ce942310a952bb4))

## [0.25.0](https://github.com/bruno00o/graph/compare/0.24.0...0.25.0) (2026-11-11)


### ⚠ BREAKING CHANGES

* select and style shapes ([#166](https://github.com/bruno00o/graph/issues/166))
* draw shapes under the graph ([#165](https://github.com/bruno00o/graph/issues/165))

### Features

* draw shapes under the graph ([#165](https://github.com/bruno00o/graph/issues/165)) ([40cec0a](https://github.com/bruno00o/graph/commit/40cec0a4befc851504d0899ecfa0f64704cc3d28))
* select and style shapes ([#166](https://github.com/bruno00o/graph/issues/166)) ([039bada](https://github.com/bruno00o/graph/commit/039bada6aa1bcdce1b9266c9c07835e00db9122b))


### Bug Fixes

* frame shapes after a gliding layout and check the default geometry field ([#168](https://github.com/bruno00o/graph/issues/168)) ([43c3fd5](https://github.com/bruno00o/graph/commit/43c3fd509657ff33e3efceced62cf563340e453a))
* warn in development when merged edge halves are asked without undirected merging ([#163](https://github.com/bruno00o/graph/issues/163)) ([5f89509](https://github.com/bruno00o/graph/commit/5f8950924f64004f8a608f59181f3c0d8e5206d1))

## [0.24.0](https://github.com/bruno00o/graph/compare/0.23.1...0.24.0) (2026-11-11)


### Features

* select and style each direction of a two-way merged edge by its half ([#159](https://github.com/bruno00o/graph/issues/159)) ([c3f3c75](https://github.com/bruno00o/graph/commit/c3f3c759db8f57247fce8c0936938c70323855ce))
* tell when the live data of a graph is loaded and lay it out once complete ([#158](https://github.com/bruno00o/graph/issues/158)) ([6258d7f](https://github.com/bruno00o/graph/commit/6258d7f3a0ca0afdb6ebb988ebf558f991523c5a))

## [0.23.1](https://github.com/bruno00o/graph/compare/0.23.0...0.23.1) (2026-11-11)


### Bug Fixes

* refuse a bare string where a list of keys is expected and keep the minimap off maps ([#153](https://github.com/bruno00o/graph/issues/153)) ([06d0d04](https://github.com/bruno00o/graph/commit/06d0d04cb5961aa9c0d0bf053696d01120877704))

## [0.23.0](https://github.com/bruno00o/graph/compare/0.22.0...0.23.0) (2026-11-10)


### Features

* ship agent skills for coding agents in the package ([#145](https://github.com/bruno00o/graph/issues/145)) ([d906a46](https://github.com/bruno00o/graph/commit/d906a4600050eb7ea1acda6c6990d4d4b155837e))

## [0.22.0](https://github.com/bruno00o/graph/compare/0.21.0...0.22.0) (2026-11-09)


### Features

* read a graph from outside of its element with a graph option on the react hooks ([#140](https://github.com/bruno00o/graph/issues/140)) ([7194aea](https://github.com/bruno00o/graph/commit/7194aea94620e92761b88eaf7e02d271d82edc3c))


### Bug Fixes

* end view, node and edge animations at once when frames take longer than them ([#144](https://github.com/bruno00o/graph/issues/144)) ([755264e](https://github.com/bruno00o/graph/commit/755264e3739754be9f860e21bd190ddc1982de8c))
* keep the graph layer in place when the map style changes with a style object ([#141](https://github.com/bruno00o/graph/issues/141)) ([f6f16d7](https://github.com/bruno00o/graph/commit/f6f16d72cffdecc8a20304ae2dfea7adca1dff90))

## [0.21.0](https://github.com/bruno00o/graph/compare/0.20.0...0.21.0) (2026-11-08)


### Features

* draw edges between groups as one edge per pair of groups and set the fill opacity of containers ([#135](https://github.com/bruno00o/graph/issues/135)) ([05be978](https://github.com/bruno00o/graph/commit/05be978552c7d40bdd84818f8776d8df9e2aef26))
* lay out large graphs in levels with the force layout ([#136](https://github.com/bruno00o/graph/issues/136)) ([a22e8a2](https://github.com/bruno00o/graph/commit/a22e8a2e7676a57c565bac758c279d8ffb080694))

## [0.20.0](https://github.com/bruno00o/graph/compare/0.19.0...0.20.0) (2026-11-08)


### Features

* draw edges through given waypoints ([#129](https://github.com/bruno00o/graph/issues/129)) ([9bb61ed](https://github.com/bruno00o/graph/commit/9bb61edb7917f42660c73e0dcff3794ff1cb644c))
* read and write graphml, gexf, json graph format and csv files ([#128](https://github.com/bruno00o/graph/issues/128)) ([4efbe83](https://github.com/bruno00o/graph/commit/4efbe836598b60237df5393cbb8f3c9721bf10d4))


### Bug Fixes

* accept any key in reads, remeasure late web fonts and tidy minimap sizes ([#126](https://github.com/bruno00o/graph/issues/126)) ([af0e13f](https://github.com/bruno00o/graph/commit/af0e13f43d9eb1a77723bc8f30bf305e5e2bd049))

## [0.19.0](https://github.com/bruno00o/graph/compare/0.18.0...0.19.0) (2026-11-08)


### ⚠ BREAKING CHANGES

* reject or repair invalid numbers in hull, grid, export and edge limits ([#121](https://github.com/bruno00o/graph/issues/121))

### Features

* keep layered layouts compact when long edges cross many layers ([#122](https://github.com/bruno00o/graph/issues/122)) ([5630d36](https://github.com/bruno00o/graph/commit/5630d3660ee992b1e79040bdc90894356836c880))


### Bug Fixes

* reject or repair invalid numbers in hull, grid, export and edge limits ([#121](https://github.com/bruno00o/graph/issues/121)) ([f21b2a1](https://github.com/bruno00o/graph/commit/f21b2a123e11622ef218b9bc103d7e7828cc3060))

## [0.18.0](https://github.com/bruno00o/graph/compare/0.17.1...0.18.0) (2026-11-08)


### Features

* spread the overlapping members of an unfolded group around their place ([#119](https://github.com/bruno00o/graph/issues/119)) ([17aebff](https://github.com/bruno00o/graph/commit/17aebffed195019e020fe3cd628a23c2a113c3ef))

## [0.17.1](https://github.com/bruno00o/graph/compare/0.17.0...0.17.1) (2026-11-08)


### Bug Fixes

* draw the groups of nodes placed on a map in screen units so they can be dragged ([#115](https://github.com/bruno00o/graph/issues/115)) ([7532801](https://github.com/bruno00o/graph/commit/753280115615ce679be3b1d022056e0aca659986))
* let light tokens nest inside a dark page and accept explicit item types on marks ([#113](https://github.com/bruno00o/graph/issues/113)) ([b32bb17](https://github.com/bruno00o/graph/commit/b32bb1753f4db0a9f6cf5957bb7b834b17b500ae))

## [0.17.0](https://github.com/bruno00o/graph/compare/0.16.0...0.17.0) (2026-11-08)


### Features

* add a geo layout that places nodes by longitude and latitude and moves overlaps apart ([#110](https://github.com/bruno00o/graph/issues/110)) ([6c1173c](https://github.com/bruno00o/graph/commit/6c1173cf5dcc02f78b1907056e3efbfcfb6e1ed6))
* convert cypher query results into nodes and edges ([#107](https://github.com/bruno00o/graph/issues/107)) ([2676271](https://github.com/bruno00o/graph/commit/2676271cd7eb2c7595c18f421c10dc16f7ea8ed8))
* draw box nodes sized to their label with contrasting text ([#111](https://github.com/bruno00o/graph/issues/111)) ([a60a3c0](https://github.com/bruno00o/graph/commit/a60a3c0516e4aeb8a75779d5b73d09b650f10ffd))


### Bug Fixes

* keep store subscribers notified when they call actions of the graph ([#106](https://github.com/bruno00o/graph/issues/106)) ([af8aa8a](https://github.com/bruno00o/graph/commit/af8aa8a723346afdd891f42e5fdd07fa37293a12))
* load only the images the atlas can hold, a few at a time ([#108](https://github.com/bruno00o/graph/issues/108)) ([6cc339d](https://github.com/bruno00o/graph/commit/6cc339d627157eb740bfffa97071a27bb4c1b40a))

## [0.16.0](https://github.com/bruno00o/graph/compare/0.15.0...0.16.0) (2026-11-07)


### ⚠ BREAKING CHANGES

* keep layouts sound with fixed nodes, large nodes and missing positions ([#102](https://github.com/bruno00o/graph/issues/102))
* keep controlled requests, drags, keys and hover consistent ([#101](https://github.com/bruno00o/graph/issues/101))
* restyle elements after several definition updates and refuse invalid keys and numbers ([#100](https://github.com/bruno00o/graph/issues/100))

### Bug Fixes

* isolate event handlers and stop host work once the graph is destroyed ([#98](https://github.com/bruno00o/graph/issues/98)) ([5e2bb32](https://github.com/bruno00o/graph/commit/5e2bb323fae806206ef731f13bdefacc26a83b29))
* keep colors, categories, merged edges and states of the scene consistent ([#104](https://github.com/bruno00o/graph/issues/104)) ([2bdd6fa](https://github.com/bruno00o/graph/commit/2bdd6fa1f00b144cff45e9da107553a2d4608ef5))
* keep controlled requests, drags, keys and hover consistent ([#101](https://github.com/bruno00o/graph/issues/101)) ([c71b2c0](https://github.com/bruno00o/graph/commit/c71b2c0b32a9cd31c833fd13eb3f194521893ddc))
* keep export filters, recycle the glyph atlas and upload only moved positions ([#103](https://github.com/bruno00o/graph/issues/103)) ([185e343](https://github.com/bruno00o/graph/commit/185e34341ab7c0e191be2fd26b72e787cfa163fd))
* keep layouts sound with fixed nodes, large nodes and missing positions ([#102](https://github.com/bruno00o/graph/issues/102)) ([f3d0322](https://github.com/bruno00o/graph/commit/f3d0322a33d3495225cf3fdab8aa1b145d18bf9d))
* restyle elements after several definition updates and refuse invalid keys and numbers ([#100](https://github.com/bruno00o/graph/issues/100)) ([a7fef3f](https://github.com/bruno00o/graph/commit/a7fef3fe2ced8890b24deded93621d14672728f5))

## [0.15.0](https://github.com/bruno00o/graph/compare/0.14.2...0.15.0) (2026-11-07)


### ⚠ BREAKING CHANGES

* take literal sizes as given and give each mark its own scales ([#95](https://github.com/bruno00o/graph/issues/95))
* fit elements with options, wrap the selection event and walk paths backward ([#94](https://github.com/bruno00o/graph/issues/94))
* accept undefined in every option and give each anchor a single target ([#91](https://github.com/bruno00o/graph/issues/91))

### Features

* accept undefined in every option and give each anchor a single target ([#91](https://github.com/bruno00o/graph/issues/91)) ([04948f3](https://github.com/bruno00o/graph/commit/04948f39a051f0156b57946fd9d3f1b35aeec9ed))
* add an abort signal, a drawn promise and a map component for react ([#96](https://github.com/bruno00o/graph/issues/96)) ([d68d299](https://github.com/bruno00o/graph/commit/d68d299f024c3746ea68602bd91cd0d7b6a7fda8))
* dim the rest, force labels and style nodes and edges apart in states ([#93](https://github.com/bruno00o/graph/issues/93)) ([ef3aaee](https://github.com/bruno00o/graph/commit/ef3aaeef0a1c4eed97740e9088ccbfa41227bec9))
* fit elements with options, wrap the selection event and walk paths backward ([#94](https://github.com/bruno00o/graph/issues/94)) ([5896574](https://github.com/bruno00o/graph/commit/58965744a68fcfb5aa995a9e4c54a18d2b620610))
* read data issues, element counts and position snapshots ([#97](https://github.com/bruno00o/graph/issues/97)) ([41d0ed2](https://github.com/bruno00o/graph/commit/41d0ed294311f681365428ec4274383862270159))
* take literal sizes as given and give each mark its own scales ([#95](https://github.com/bruno00o/graph/issues/95)) ([e3bd812](https://github.com/bruno00o/graph/commit/e3bd8125a33085c618064ba9b64c48ab439fd282))

## [0.14.2](https://github.com/bruno00o/graph/compare/0.14.1...0.14.2) (2026-11-07)


### Bug Fixes

* keep early fits, free released nodes, pick by shape and route along the axis ([#89](https://github.com/bruno00o/graph/issues/89)) ([1c1121c](https://github.com/bruno00o/graph/commit/1c1121c4fed3a16397dde30ffaae714be0728e43))

## [0.14.1](https://github.com/bruno00o/graph/compare/0.14.0...0.14.1) (2026-11-07)


### Bug Fixes

* make safari and firefox behave like chrome ([#81](https://github.com/bruno00o/graph/issues/81)) ([e6b2991](https://github.com/bruno00o/graph/commit/e6b2991ca41507f2841f5688c7459b3ffc4921aa))
* stay within webgl2 minimum limits and recover from context loss ([#79](https://github.com/bruno00o/graph/issues/79)) ([d246ee9](https://github.com/bruno00o/graph/commit/d246ee9e2106dd616493a6728c71d0c2acd1cf89))

## [0.14.0](https://github.com/bruno00o/graph/compare/0.13.0...0.14.0) (2026-11-07)


### Features

* merge parallel edges, group items by a field and hide states without losing them ([#76](https://github.com/bruno00o/graph/issues/76)) ([0a6fde9](https://github.com/bruno00o/graph/commit/0a6fde912d1e0b6e2702df013c37986229c17a69))
* route edges around nodes and jump over crossings ([#77](https://github.com/bruno00o/graph/issues/77)) ([782cec4](https://github.com/bruno00o/graph/commit/782cec4d0a807c8f0dcf06bac2ca22493862a7f9))
* show and hide layers of marks, band edges by layer and walk edge support ([#73](https://github.com/bruno00o/graph/issues/73)) ([eb4b4fd](https://github.com/bruno00o/graph/commit/eb4b4fd59dd511a9feda4c387fb7665296ad54ce))
* style each end of an edge on its own ([#75](https://github.com/bruno00o/graph/issues/75)) ([07f2796](https://github.com/bruno00o/graph/commit/07f279630070dbb8e9915475f78054355207346f))

## [0.13.0](https://github.com/bruno00o/graph/compare/0.12.0...0.13.0) (2026-11-07)


### Features

* draw map graphs on the globe, along great circles, with hulls and groups ([#72](https://github.com/bruno00o/graph/issues/72)) ([862d946](https://github.com/bruno00o/graph/commit/862d9465d7a13128ee35d33c08682d9ff30cbda8))
* raise states above every mark and magnify the graph with a lens ([#69](https://github.com/bruno00o/graph/issues/69)) ([7a0927b](https://github.com/bruno00o/graph/commit/7a0927b1258d9ddcd39c3422575dff9c7603ac56))
* show nodes and edges in a time window and add a timeline ([#71](https://github.com/bruno00o/graph/issues/71)) ([ddf8678](https://github.com/bruno00o/graph/commit/ddf867898133320102f0416f53528cead7af6de2))

## [0.12.0](https://github.com/bruno00o/graph/compare/0.11.0...0.12.0) (2026-11-06)


### Features

* bundle edges by density once nodes stand still ([#67](https://github.com/bruno00o/graph/issues/67)) ([a5a7716](https://github.com/bruno00o/graph/commit/a5a771609ac81fead0a33ddc43f8b9adb910916d))
* lay out nested groups in layers that flow across groups ([#65](https://github.com/bruno00o/graph/issues/65)) ([b000e8b](https://github.com/bruno00o/graph/commit/b000e8b78cf4f3fb0d08496747aa8c849f00f5ca))
* show nodes and edges by zoom and draw far views faster ([#68](https://github.com/bruno00o/graph/issues/68)) ([32fd211](https://github.com/bruno00o/graph/commit/32fd211aaed12105facc2206f29daa0507a4c9a3))

## [0.11.0](https://github.com/bruno00o/graph/compare/0.10.0...0.11.0) (2026-11-06)


### Features

* add a minimap and a legend ([#63](https://github.com/bruno00o/graph/issues/63)) ([58e154a](https://github.com/bruno00o/graph/commit/58e154a5b4c77b57ab8b394f2df75221f965507a))
* draw the graph inside a maplibre map and control the view ([#64](https://github.com/bruno00o/graph/issues/64)) ([aadb3b5](https://github.com/bruno00o/graph/commit/aadb3b596f7a0bd0af455006ea620248ccb0b416))
* find shortest paths and nodes within reach, and move dashes along flowing edges ([#61](https://github.com/bruno00o/graph/issues/61)) ([97662e4](https://github.com/bruno00o/graph/commit/97662e4bc1840b1b6dc214c45d531ba3c61f2c29))

## [0.10.0](https://github.com/bruno00o/graph/compare/0.9.1...0.10.0) (2026-11-06)


### ⚠ BREAKING CHANGES

* infer the item types of marks in events, state and react props ([#58](https://github.com/bruno00o/graph/issues/58))

### Features

* configure the wheel, bound the zoom and the view, pinch on touch screens and pan at the edges while dragging ([#59](https://github.com/bruno00o/graph/issues/59)) ([39b6ce3](https://github.com/bruno00o/graph/commit/39b6ce3bdc0cc65620393edd761b068d70631506))
* infer the item types of marks in events, state and react props ([#58](https://github.com/bruno00o/graph/issues/58)) ([3f8a23e](https://github.com/bruno00o/graph/commit/3f8a23edb1c4526bf4dc7109deb5fb62a354cdcb))
* keep group containers apart in layouts ([#60](https://github.com/bruno00o/graph/issues/60)) ([4b560cd](https://github.com/bruno00o/graph/commit/4b560cd61d14ec69742656a842f2a71b1433a8fa))
* let the background grid follow the zoom with a single level ([#56](https://github.com/bruno00o/graph/issues/56)) ([5b220ee](https://github.com/bruno00o/graph/commit/5b220eeb10318ee3fbb5626e9222f988e651ec67))

## [0.9.1](https://github.com/bruno00o/graph/compare/0.9.0...0.9.1) (2026-11-06)


### Bug Fixes

* assign layers much faster on large graphs ([#55](https://github.com/bruno00o/graph/issues/55)) ([6118399](https://github.com/bruno00o/graph/commit/611839966f9b6432ba4ca5e54da205fd249c285a))
* rewrite the force layout physics ([#53](https://github.com/bruno00o/graph/issues/53)) ([35812cf](https://github.com/bruno00o/graph/commit/35812cfb5adbf541750a3e86df767e875a1efb16))

## [0.9.0](https://github.com/bruno00o/graph/compare/0.8.0...0.9.0) (2026-11-06)


### Features

* draw a background grid, hulls around nodes and html anchors ([#50](https://github.com/bruno00o/graph/issues/50)) ([6eca3bb](https://github.com/bruno00o/graph/commit/6eca3bbfd3e70cac130a25b88d7f60e45aaab287))
* export graphs as png and svg ([#47](https://github.com/bruno00o/graph/issues/47)) ([b22e801](https://github.com/bruno00o/graph/commit/b22e8015e7f7b21ee650ddb4a6a49af8ffdc37fe))
* fold and unfold nested groups and merge the edges between them ([#48](https://github.com/bruno00o/graph/issues/48)) ([31764fb](https://github.com/bruno00o/graph/commit/31764fb61103bf361146dd5bc6c4910727b887a9))


### Bug Fixes

* load very large graphs and their picking index about twice as fast ([#51](https://github.com/bruno00o/graph/issues/51)) ([e54347b](https://github.com/bruno00o/graph/commit/e54347bf65d4e559d81aba0546073945cf8b4d4c))

## [0.8.0](https://github.com/bruno00o/graph/compare/0.7.1...0.8.0) (2026-11-06)


### ⚠ BREAKING CHANGES

* measure the spacing of grid, rings and radial between node borders, like every other layout ([#43](https://github.com/bruno00o/graph/issues/43))

### Features

* measure the spacing of grid, rings and radial between node borders, like every other layout ([#43](https://github.com/bruno00o/graph/issues/43)) ([9184a35](https://github.com/bruno00o/graph/commit/9184a35a19a55af9a40266df45a6cfaf5a55169b))

## [0.7.1](https://github.com/bruno00o/graph/compare/0.7.0...0.7.1) (2026-11-06)


### Bug Fixes

* draw the first frame of large graphs about twice as fast ([#41](https://github.com/bruno00o/graph/issues/41)) ([8db8f65](https://github.com/bruno00o/graph/commit/8db8f650b20b1ad30beaf61940c52705352bec5f))

## [0.7.0](https://github.com/bruno00o/graph/compare/0.6.0...0.7.0) (2026-11-06)


### Features

* filter large graphs with tanstack db and load them on demand ([#38](https://github.com/bruno00o/graph/issues/38)) ([c4fb403](https://github.com/bruno00o/graph/commit/c4fb4039cabbca8e1d3479d62782495bba9ab10d))
* inspect graphs and their render timings in tanstack devtools ([#36](https://github.com/bruno00o/graph/issues/36)) ([302b7ca](https://github.com/bruno00o/graph/commit/302b7cafcf0024a233798c242f42863b6e1163af))
* lay out directed graphs in layers ([#39](https://github.com/bruno00o/graph/issues/39)) ([2b5f304](https://github.com/bruno00o/graph/commit/2b5f304ce0e97fa053a9e73d79aa0c2a18311b40))

## [0.6.0](https://github.com/bruno00o/graph/compare/0.5.1...0.6.0) (2026-11-06)


### Features

* lay out nodes on a grid, in rings or around a root, and glide them to the result ([#34](https://github.com/bruno00o/graph/issues/34)) ([fdc7c9d](https://github.com/bruno00o/graph/commit/fdc7c9d347fdc8196e54d46311c696921e5ae6a8))

## [0.5.1](https://github.com/bruno00o/graph/compare/0.5.0...0.5.1) (2026-11-06)


### Bug Fixes

* lay out graphs of several hundred thousand nodes on the gpu in seconds ([#32](https://github.com/bruno00o/graph/issues/32)) ([3a9cf62](https://github.com/bruno00o/graph/commit/3a9cf62d1cc4d27733dd06129382da1367b3baa6))

## [0.5.0](https://github.com/bruno00o/graph/compare/0.4.0...0.5.0) (2026-11-06)


### Features

* draw edge labels along their edges ([#30](https://github.com/bruno00o/graph/issues/30)) ([04dd797](https://github.com/bruno00o/graph/commit/04dd7973c5c9c509f8b8d8afe6df972f7153dca4))
* lay out nodes with a force simulation in a web worker ([#27](https://github.com/bruno00o/graph/issues/27)) ([9b68feb](https://github.com/bruno00o/graph/commit/9b68febc7223fbddc654077f7d17b86c2cc02885))
* run the force layout on the gpu for large graphs ([#29](https://github.com/bruno00o/graph/issues/29)) ([06389d6](https://github.com/bruno00o/graph/commit/06389d60a54e032aeab00048f1523a648cbedd55))
* style labels per element with size, color, weight, font, placement and truncation ([#31](https://github.com/bruno00o/graph/issues/31)) ([eb9cfb3](https://github.com/bruno00o/graph/commit/eb9cfb32ea94e469f9cb808c250f17afdb01eaba))

## [0.4.0](https://github.com/bruno00o/graph/compare/0.3.0...0.4.0) (2026-11-06)


### Features

* draw node outlines and label backgrounds ([#24](https://github.com/bruno00o/graph/issues/24)) ([3e703fa](https://github.com/bruno00o/graph/commit/3e703fa0d283e26fb3bb8779e1fab59da6accaf0))

## [0.3.0](https://github.com/bruno00o/graph/compare/0.2.0...0.3.0) (2026-11-06)


### Features

* draw images, icons and corner badges on nodes ([#20](https://github.com/bruno00o/graph/issues/20)) ([6493446](https://github.com/bruno00o/graph/commit/649344638faa2640b5e3c3ecb1d33b506e867b78))
* navigate, select and zoom from the keyboard ([#23](https://github.com/bruno00o/graph/issues/23)) ([b58c13e](https://github.com/bruno00o/graph/commit/b58c13ea4c77bdc79f6403d3d96541ec9a924cb2))
* select nodes with a lasso drawn with shift and drag ([#22](https://github.com/bruno00o/graph/issues/22)) ([7be468e](https://github.com/bruno00o/graph/commit/7be468e3f894db0398eec12b9912ef0c9a51dff3))

## [0.2.0](https://github.com/bruno00o/graph/compare/0.1.0...0.2.0) (2026-11-06)


### Features

* draw parallel edges as separate arcs and self loops around their node ([#16](https://github.com/bruno00o/graph/issues/16)) ([e9e5abf](https://github.com/bruno00o/graph/commit/e9e5abf92aa335fa4c86cb5ad0a438152240ab8f))

## 0.1.0 (2026-11-06)


### Features

* add graph definition, marks and data model ([30deaf2](https://github.com/bruno00o/graph/commit/30deaf2d9c90cd744b4cf3e89eb4c099dc5a2ff4))
* add scales and render-neutral scene ([4b7e411](https://github.com/bruno00o/graph/commit/4b7e41163210faaa67f5afef9cd951012b1942ba))
* add the react adapter with graph component, hooks and overlays ([#8](https://github.com/bruno00o/graph/issues/8)) ([74ced6d](https://github.com/bruno00o/graph/commit/74ced6dc7103adff4cf152e3e0c299c75a30251a))
* add view math, initial placement and picking ([01160f2](https://github.com/bruno00o/graph/commit/01160f2f2318319ddd33b1c4563caa9277b377bb))
* control the selection from props and type state names from the definition ([#11](https://github.com/bruno00o/graph/issues/11)) ([aa706f9](https://github.com/bruno00o/graph/commit/aa706f9c9bda4a725946d56eb25456ab1ba428fd))
* explore neighborhoods from tanstack query options ([#14](https://github.com/bruno00o/graph/issues/14)) ([0bcb327](https://github.com/bruno00o/graph/commit/0bcb3271ce4c3eed84cac81f15e820f7c3357ec8))
* expose host state as a read-only tanstack store usable with useSelector ([#10](https://github.com/bruno00o/graph/issues/10)) ([d1a48ae](https://github.com/bruno00o/graph/commit/d1a48ae38513777170af02b17859c2c1b99982f2))
* mount graphs rendered with webgl2, with pan, zoom, labels and css theme ([#6](https://github.com/bruno00o/graph/issues/6)) ([2b574e9](https://github.com/bruno00o/graph/commit/2b574e99797870615488aecb111a2344646b5146))
* move existing nodes when their x and y change in the data ([#12](https://github.com/bruno00o/graph/issues/12)) ([851d3b9](https://github.com/bruno00o/graph/commit/851d3b9c1028fa66d2e31606ed7a1ee5a3ff6cda))
* persist dragged positions into tanstack db collections ([#13](https://github.com/bruno00o/graph/issues/13)) ([770c40e](https://github.com/bruno00o/graph/commit/770c40eabfd84733ecae2d0fb4f07676a1fe50a8))
* select, hover, drag and style graph elements with typed events and host state ([#7](https://github.com/bruno00o/graph/issues/7)) ([9ad0d9f](https://github.com/bruno00o/graph/commit/9ad0d9f42d916f304896473139425d8d320c4f9e))


### Performance Improvements

* keep 50k node graphs smooth with narrow edges, warm pipelines and culled labels ([#9](https://github.com/bruno00o/graph/issues/9)) ([8245032](https://github.com/bruno00o/graph/commit/824503235577c55aaac18eb327813494f8c656e0))
