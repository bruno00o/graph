import type { ExampleMeta } from '../types'

export default {
  title: 'Shape editing',
  description:
    'A shape editor over the graph: press a shape to select and move it, drag its points, its midpoints and the handles of its box, and the editor proposes each change to the data, which takes it or not.',
  hint: 'Drag a shape, then a point of the selected area; press a midpoint to add a point, Alt and click to remove one, Shift to keep the proportions of a box, Delete to remove the selection, and Undo to go back.',
  category: 'interaction',
  order: 130,
  tags: ['Vanilla'],
  api: ['editor', 'shapes'],
  guides: ['editing-shapes#moving-and-reshaping', 'editing-shapes#writing-edits-back'],
} satisfies ExampleMeta
