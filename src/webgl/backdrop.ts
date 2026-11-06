import { gridLevels } from '../core/background-grid'
import { hullInstanceWords } from '../core/hull-layer'
import type { GridInput, RenderFrame, RenderInput } from '../host/renderer'
import { gridFragment, gridVertex, hullFragment, hullVertex } from './backdrop-shaders'
import { type Attribute, createProgram, createVertexArray } from './gl'

export interface Backdrop {
  sync(input: RenderInput): void
  draw(frame: RenderFrame): void
  destroy(): void
}

interface GridPass {
  readonly program: WebGLProgram
  readonly vao: WebGLVertexArrayObject
  readonly levels: WebGLUniformLocation | null
  readonly colors: WebGLUniformLocation | null
  readonly dots: WebGLUniformLocation | null
}

interface HullPass {
  readonly program: WebGLProgram
  readonly vao: WebGLVertexArrayObject
  readonly buffer: WebGLBuffer
  readonly stroke: WebGLUniformLocation | null
}

const stride = hullInstanceWords * 4

export function createBackdrop(
  gl: WebGL2RenderingContext,
  blocks: Readonly<Record<string, number>>,
): Backdrop {
  let grid: GridInput | null = null
  let gridPass: GridPass | null = null
  let hullPass: HullPass | null = null
  let hullCount = 0
  let hullVersion = -1
  const levels = new Float32Array(12)

  function gridProgram(): GridPass {
    if (gridPass) return gridPass
    const program = createProgram(gl, gridVertex, gridFragment, blocks)
    gridPass = {
      program,
      vao: gl.createVertexArray(),
      levels: gl.getUniformLocation(program, 'gridLevels'),
      colors: gl.getUniformLocation(program, 'gridColors'),
      dots: gl.getUniformLocation(program, 'gridDots'),
    }
    return gridPass
  }

  function hullProgram(): HullPass {
    if (hullPass) return hullPass
    const program = createProgram(gl, hullVertex, hullFragment, blocks)
    const buffer = gl.createBuffer()
    const field = (
      name: string,
      size: number,
      offset: number,
      type: number = gl.FLOAT,
    ): Attribute => ({
      name,
      buffer,
      size,
      type,
      integer: type === gl.UNSIGNED_INT,
      divisor: 1,
      stride,
      offset,
    })
    hullPass = {
      program,
      buffer,
      vao: createVertexArray(gl, program, [
        field('hullA', 4, 0),
        field('hullAOffset', 1, 16),
        field('hullB', 4, 20),
        field('hullBOffset', 1, 36),
        field('hullCenter', 2, 40),
        field('hullColors', 2, 48, gl.UNSIGNED_INT),
        field('hullSize', 2, 56),
      ]),
      stroke: gl.getUniformLocation(program, 'hullStroke'),
    }
    return hullPass
  }

  return {
    sync(input) {
      grid = input.grid ?? null
      const hulls = input.hulls
      if (!hulls || hulls.version === hullVersion) return
      hullVersion = hulls.version
      hullCount = hulls.count
      if (hullCount === 0 && !hullPass) return
      const pass = hullProgram()
      gl.bindBuffer(gl.ARRAY_BUFFER, pass.buffer)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Uint8Array(hulls.data, 0, hullCount * stride),
        gl.DYNAMIC_DRAW,
      )
    },

    draw(frame) {
      if (grid) {
        const pass = gridProgram()
        gridLevels(grid.spacing, frame.view, frame).forEach((level, i) => {
          levels.set([level.pitch, level.offsetX, level.offsetY, level.weight], i * 4)
        })
        gl.useProgram(pass.program)
        gl.uniform4fv(pass.levels, levels)
        gl.uniform2ui(pass.colors, grid.color, grid.majorColor)
        gl.uniform1i(pass.dots, grid.pattern === 'dots' ? 1 : 0)
        gl.bindVertexArray(pass.vao)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
      if (hullPass && hullCount > 0) {
        gl.useProgram(hullPass.program)
        gl.bindVertexArray(hullPass.vao)
        for (const stroke of [0, 1]) {
          gl.uniform1i(hullPass.stroke, stroke)
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, hullCount)
        }
      }
      gl.bindVertexArray(null)
    },

    destroy() {
      for (const pass of [gridPass, hullPass]) {
        if (!pass) continue
        gl.deleteVertexArray(pass.vao)
        gl.deleteProgram(pass.program)
      }
      if (hullPass) gl.deleteBuffer(hullPass.buffer)
    },
  }
}
