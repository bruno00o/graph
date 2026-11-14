import type { ExampleMeta } from '../types'

export default {
  title: 'Shape editing',
  description:
    'A shape editor over the graph: draw rectangles, circles, lines, polygons and freehand strokes, press a shape to select and move it, drag its points and the handles of its box, and undo; the editor proposes each change to the data, which takes it or not.',
  hint: 'Pick a tool and draw: drag or click twice for a rectangle or a circle, click point by point for a line or a polygon and press Enter. With Select, drag a shape or its points; Shift keeps proportions and angles, Cmd or Ctrl and D duplicates, Cmd or Ctrl and Z undoes.',
  category: 'interaction',
  order: 130,
  tags: ['Vanilla'],
  api: ['editor', 'shapes'],
  guides: ['editing-shapes#drawing-shapes', 'editing-shapes#undo-and-redo'],
} satisfies ExampleMeta
