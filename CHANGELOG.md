# Changelog

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
