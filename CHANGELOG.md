# Changelog

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
