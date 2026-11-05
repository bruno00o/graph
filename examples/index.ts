import { messages } from './shared/messages'
import { createPage } from './shared/page'

const { main } = createPage(messages.title)
const list = document.createElement('ul')
for (const [href, text] of [['./vanilla/', messages.vanilla]] as const) {
  const item = document.createElement('li')
  const link = document.createElement('a')
  link.href = href
  link.textContent = text
  item.append(link)
  list.append(item)
}
main.append(list)
