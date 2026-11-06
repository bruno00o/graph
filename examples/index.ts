import { messages } from './shared/messages'
import { createPage } from './shared/page'

const { main } = createPage(messages.title)
const list = document.createElement('ul')
for (const [href, text] of [
  ['./vanilla/', messages.vanilla],
  ['./react/', messages.react],
  ['./collab/', messages.collab],
  ['./explore/', messages.explore],
  ['./edges/', messages.edges],
  ['./groups/', messages.groups],
  ['./nodes/', messages.nodes],
  ['./labels/', messages.labels],
  ['./layout/', messages.layout],
  ['./layouts/', messages.layouts],
  ['./filter/', messages.filter],
  ['./drawing/', messages.drawing],
  ['./map/', messages.map],
  ['./bundling/', messages.bundling],
] as const) {
  const item = document.createElement('li')
  const link = document.createElement('a')
  link.href = href
  link.textContent = text
  item.append(link)
  list.append(item)
}
main.append(list)
