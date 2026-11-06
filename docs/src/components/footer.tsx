import type { JSX } from 'react'
import { messages } from '../messages'
import { changelog, npmPackage, repository, version } from '../site'

export function SiteFooter(): JSX.Element {
  return (
    <footer className="site-footer">
      <div className="wrap footer-in">
        <span className="footer-brand">{messages.siteName}</span>
        <span className="small muted">{messages.license}</span>
        <span className="spacer" />
        <div className="footer-links">
          <a className="ulink" href={repository}>
            {messages.github}
          </a>
          <a className="ulink" href={npmPackage}>
            {messages.npm}
          </a>
          <a className="ulink" href={changelog}>
            {messages.changelog}
          </a>
          <span>{messages.version(version)}</span>
        </div>
      </div>
    </footer>
  )
}
