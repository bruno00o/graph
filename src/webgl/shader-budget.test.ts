import { describe, expect, it } from 'vitest'
import {
  boundsBlockFragment,
  boundsFragment,
  fullVertex,
  groupReduceFragment,
  groupSolveFragment,
  groupSplatVertex,
  integrateFragment,
  reduceFragment,
  splatVertex,
  springVertex,
  valueFragment,
} from '../layouts/force/gpu-shaders'
import {
  budgetProblems,
  measureProgram,
  packs,
  preprocess,
  rowsNeeded,
  std140Size,
  webgl2Minimums,
} from '../testing/shader-budget'
import { arcVertex } from './arc-shaders'
import { gridFragment, gridVertex, hullFragment, hullVertex } from './backdrop-shaders'
import { bundleVertexOf } from './bundle-shaders'
import {
  badgeFragment,
  badgeVertex,
  clippedEdgeFragment,
  curveVertex,
  edgeFragmentOf,
  edgeVertexOf,
  header,
  labelFragment,
  labelVertex,
  lensFragment,
  lensVertex,
  nodeFragment,
  nodeVertex,
  withEnds,
} from './shaders'
import {
  shapeFillFragment,
  shapeFillVertex,
  shapeRoundFragment,
  shapeRoundVertex,
  shapeStrokeFragment,
  shapeStrokeVertex,
} from './shape-shaders'
import { waypointVertex } from './waypoint-shaders'

type Program = readonly [name: string, vertex: string, fragment: string]

const endless: readonly Program[] = [
  ['edge', edgeVertexOf(false), clippedEdgeFragment],
  ['edge bridged', edgeVertexOf(true), edgeFragmentOf(true, true)],
  ['curve', curveVertex, clippedEdgeFragment],
  ['arc', arcVertex, clippedEdgeFragment],
  ['bundle', bundleVertexOf(false), edgeFragmentOf(false, false)],
  ['bundle bridged', bundleVertexOf(true), edgeFragmentOf(false, true)],
  ['waypoint', waypointVertex, clippedEdgeFragment],
]

const programs: readonly Program[] = [
  ['node', nodeVertex, nodeFragment],
  ['label', labelVertex, labelFragment],
  ['badge', badgeVertex, badgeFragment],
  ...endless,
  ...endless.map(
    ([name, vertex, fragment]): Program => [`${name} ends`, withEnds(vertex), withEnds(fragment)],
  ),
  ['lens', lensVertex, lensFragment],
  ['grid', gridVertex, gridFragment],
  ['hull', hullVertex, hullFragment],
  ['shape fill', shapeFillVertex, shapeFillFragment],
  ['shape stroke', shapeStrokeVertex, shapeStrokeFragment],
  ['shape round', shapeRoundVertex, shapeRoundFragment],
  ['layout bounds', fullVertex, boundsBlockFragment],
  ['layout bounds reduce', fullVertex, boundsFragment],
  ['layout splat', splatVertex, valueFragment],
  ['layout reduce', fullVertex, reduceFragment],
  ['layout spring', springVertex, valueFragment],
  ['layout integrate', fullVertex, integrateFragment],
  ['layout group splat', groupSplatVertex, valueFragment],
  ['layout group reduce', fullVertex, groupReduceFragment],
  ['layout group solve', fullVertex, groupSolveFragment],
]

describe('shader budget', () => {
  it.each(programs)('keeps %s within the WebGL2 minimum limits', (name, vertex, fragment) => {
    expect(budgetProblems(measureProgram(name, vertex, fragment))).toEqual([])
  })

  it('stops edges at container borders in every program with room for the box sampler', () => {
    const boxed = (vertex: string) => /uniform sampler2D nodeBox;/.test(preprocess(vertex))
    for (const [name, vertex] of endless) {
      expect([name, boxed(vertex), boxed(withEnds(vertex))]).toEqual([
        name,
        true,
        name !== 'bundle bridged',
      ])
    }
    expect(boxed(labelVertex)).toBe(true)
  })

  it('counts every sampler a program statically uses', () => {
    const label = measureProgram('label', labelVertex, labelFragment)
    expect(label.vertexSamplers).toBe(16)
    expect(label.fragmentSamplers).toBe(2)
    const bundle = measureProgram(
      'bundle',
      withEnds(bundleVertexOf(true)),
      withEnds(edgeFragmentOf(false, true)),
    )
    expect(bundle.vertexSamplers).toBeLessThanOrEqual(16)
    expect(bundle.reachableSamplers).toBeLessThanOrEqual(bundle.vertexSamplers)
  })

  it('fails a program with a sampler over the limit', () => {
    const extra = Array.from({ length: 17 }, (_, i) => `uniform sampler2D s${i};`).join('\n')
    const sum = Array.from({ length: 17 }, (_, i) => `texelFetch(s${i}, ivec2(0), 0)`).join(' + ')
    const vertex = `#version 300 es\n${extra}\nvoid main() { gl_Position = ${sum}; }`
    const fragment =
      '#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main() { color = vec4(1.0); }'
    expect(budgetProblems(measureProgram('crowded', vertex, fragment))).toEqual([
      'crowded: declaredSamplers 17 > 16',
      'crowded: vertexSamplers 17 > 16',
    ])
  })

  it('fails a program with varyings that do not pack in 15 rows', () => {
    const names = Array.from({ length: 16 }, (_, i) => `v${i}`)
    const vertex = `${header}\n${names.map((n) => `flat out vec4 ${n};`).join('\n')}\nvoid main() {\n${names.map((n) => `${n} = vec4(0.0);`).join('\n')}\n}`
    const fragment = `${header}\n${names.map((n) => `flat in vec4 ${n};`).join('\n')}\nout vec4 color;\nvoid main() { color = ${names.join(' + ')}; }`
    const problems = budgetProblems(measureProgram('wide', vertex, fragment))
    expect(problems).toContain('wide: varyingComponents 64 > 60')
    expect(problems.some((problem) => problem.startsWith('wide: varyingVectors'))).toBe(true)
  })

  it('packs varyings as the GLSL ES counting algorithm does', () => {
    const example = [
      { name: 'a', type: 'vec4', count: 1 },
      { name: 'b', type: 'mat3', count: 1 },
      { name: 'c', type: 'vec2', count: 3 },
      { name: 'd', type: 'vec2', count: 2 },
      { name: 'e', type: 'vec2', count: 1 },
      { name: 'f', type: 'float', count: 3 },
      { name: 'g', type: 'float', count: 2 },
      { name: 'h', type: 'float', count: 1 },
    ]
    expect(packs(example, 8)).toBe(true)
    expect(rowsNeeded(example)).toBe(8)
    expect(packs([...example, { name: 'k', type: 'float', count: 2 }], 8)).toBe(false)
    expect(rowsNeeded([{ name: 'i', type: 'float', count: 1 }])).toBe(1)
    expect(packs([{ name: 'j', type: 'vec3', count: 9 }], 8)).toBe(false)
  })

  it('sizes uniform blocks with the std140 rules', () => {
    expect(std140Size([{ name: 'a', type: 'float', count: 1 }])).toBe(16)
    expect(
      std140Size([
        { name: 'a', type: 'vec2', count: 1 },
        { name: 'b', type: 'vec3', count: 1 },
        { name: 'c', type: 'vec4', count: 64 },
      ]),
    ).toBe(16 + 16 + 1024)
    const frame = measureProgram('node', nodeVertex, nodeFragment)
    expect(frame.blockSize).toBe(6176)
    expect(webgl2Minimums.blockSize).toBeGreaterThan(frame.blockSize)
  })
})
