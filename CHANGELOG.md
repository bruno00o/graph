# Changelog

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
