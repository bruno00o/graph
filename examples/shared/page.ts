export interface Page {
  readonly header: HTMLElement
  readonly main: HTMLElement
}

export function createPage(title: string): Page {
  document.title = title
  const header = document.createElement('header')
  const heading = document.createElement('h1')
  heading.textContent = title
  header.append(heading)
  const main = document.createElement('main')
  document.body.append(header, main)
  return { header, main }
}

export function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

export function choice(
  text: string,
  options: readonly { readonly value: string; readonly text: string }[],
  selected: string,
  onChange: (value: string) => void,
): HTMLLabelElement {
  const label = document.createElement('label')
  const select = document.createElement('select')
  for (const option of options) {
    select.add(new Option(option.text, option.value, false, option.value === selected))
  }
  select.addEventListener('change', () => onChange(select.value))
  label.append(`${text} `, select)
  return label
}

export function themeToggle(dark: string, light: string): HTMLButtonElement {
  const root = document.documentElement
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const current = () => root.getAttribute('data-theme') ?? (media.matches ? 'dark' : 'light')
  const element = button('', () => {
    root.setAttribute('data-theme', current() === 'dark' ? 'light' : 'dark')
    sync()
  })
  const sync = () => {
    element.textContent = current() === 'dark' ? light : dark
  }
  media.addEventListener('change', sync)
  sync()
  return element
}
