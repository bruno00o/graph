const live = new Set<() => void>()

export function freshenContexts(): void {
  for (const freshen of live) freshen()
}

export function trackContext(gl: WebGL2RenderingContext): () => void {
  let target: WebGLFramebuffer | null = null
  let storage: WebGLRenderbuffer | null = null
  const freshen = (): void => {
    if (gl.isContextLost()) return
    const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    if (!target) {
      target = gl.createFramebuffer()
      storage = gl.createRenderbuffer()
      const held = gl.getParameter(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer | null
      gl.bindRenderbuffer(gl.RENDERBUFFER, storage)
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, 1, 1)
      gl.bindRenderbuffer(gl.RENDERBUFFER, held)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target)
      gl.framebufferRenderbuffer(
        gl.DRAW_FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.RENDERBUFFER,
        storage,
      )
    } else gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target)
    const scissor = gl.isEnabled(gl.SCISSOR_TEST)
    if (scissor) gl.disable(gl.SCISSOR_TEST)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (scissor) gl.enable(gl.SCISSOR_TEST)
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw)
  }
  live.add(freshen)
  return () => {
    live.delete(freshen)
    if (gl.isContextLost()) return
    if (target) gl.deleteFramebuffer(target)
    if (storage) gl.deleteRenderbuffer(storage)
  }
}
