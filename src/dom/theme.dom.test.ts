import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeTheme } from './theme'

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function nest(): { readonly outer: HTMLElement; readonly inner: HTMLElement } {
  const outer = document.createElement('section')
  const inner = document.createElement('div')
  outer.append(inner)
  document.body.append(outer)
  return { outer, inner }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('observeTheme', () => {
  it('reads the theme again when an ancestor changes its class, style or data-theme', async () => {
    const { outer, inner } = nest()
    const host = document.createElement('div')
    inner.append(host)
    const changed = vi.fn()
    const watch = observeTheme(host, changed)
    outer.classList.add('palette-x')
    await settle()
    expect(changed).toHaveBeenCalledTimes(1)
    inner.style.setProperty('--graph-cat-1', 'red')
    await settle()
    expect(changed).toHaveBeenCalledTimes(2)
    outer.setAttribute('data-theme', 'dark')
    await settle()
    expect(changed).toHaveBeenCalledTimes(3)
    outer.title = 'ignored'
    host.append(document.createElement('span'))
    outer.append(document.createElement('span'))
    await settle()
    expect(changed).toHaveBeenCalledTimes(3)
    watch.stop()
    outer.classList.add('palette-y')
    await settle()
    expect(changed).toHaveBeenCalledTimes(3)
  })

  it('follows the element when it moves to another parent', async () => {
    const first = nest()
    const second = nest()
    const host = document.createElement('div')
    first.inner.append(host)
    const changed = vi.fn()
    const watch = observeTheme(host, changed)
    second.inner.append(host)
    await settle()
    expect(changed).toHaveBeenCalledTimes(1)
    first.outer.classList.add('palette-x')
    await settle()
    expect(changed).toHaveBeenCalledTimes(1)
    second.outer.classList.add('palette-x')
    await settle()
    expect(changed).toHaveBeenCalledTimes(2)
    watch.stop()
  })

  it('picks up the ancestors of an element mounted outside the document once checked', async () => {
    const detached = document.createElement('div')
    const host = document.createElement('div')
    detached.append(host)
    const changed = vi.fn()
    const watch = observeTheme(host, changed)
    const { inner, outer } = nest()
    inner.append(detached)
    watch.check()
    expect(changed).toHaveBeenCalledTimes(1)
    watch.check()
    expect(changed).toHaveBeenCalledTimes(1)
    outer.classList.add('palette-x')
    await settle()
    expect(changed).toHaveBeenCalledTimes(2)
    watch.stop()
  })
})
