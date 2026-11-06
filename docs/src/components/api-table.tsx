import type { TypeNode } from 'fumadocs-ui/components/type-table'
import type { JSX } from 'react'
import { messages } from '../messages'

export function ApiTable({
  id,
  type,
}: {
  readonly id?: string
  readonly type: Readonly<Record<string, TypeNode>>
}): JSX.Element {
  const entries = Object.entries(type).sort(
    ([, a], [, b]) => Number(!a.required) - Number(!b.required),
  )
  return (
    <div className="api-table relative overflow-auto prose-no-margin my-6" id={id}>
      <table>
        <thead>
          <tr>
            <th>{messages.apiTable.name}</th>
            <th>{messages.apiTable.type}</th>
            <th>{messages.apiTable.description}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, node]) => (
            <tr key={name} id={id ? `${id}-${name}` : undefined}>
              <td>
                <code>{node.required ? name : `${name}?`}</code>
              </td>
              <td>{node.typeDescription ?? node.type}</td>
              <td>
                {node.description}
                {node.default ? (
                  <p className="api-default">
                    {messages.apiTable.default} {node.default}
                  </p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
