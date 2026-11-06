import { createFileRoute } from '@tanstack/react-router'
import Link from 'fumadocs-core/link'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { type JSX, lazy, Suspense } from 'react'
import { CodeTabs, CopyButton, SourceCode } from '../components/code'
import { SiteFooter } from '../components/footer'
import { Icon } from '../components/icon'
import { inline } from '../components/inline'
import {
  CollectionFigure,
  ExplorationFigure,
  StatesFigure,
  Swatches,
  TypedFigure,
} from '../home/figures'
import { describeReact, describeVanilla, reactSnippet } from '../home/snippets'
import { homeOptions } from '../lib/layout'
import { formatNumber, messages } from '../messages'
import { benchmark } from '../site'

const HeroGraph = lazy(() =>
  import('../home/hero-graph').then(({ HeroGraph }) => ({ default: HeroGraph })),
)
const DenseGraph = lazy(() =>
  import('../home/dense-graph').then(({ DenseGraph }) => ({ default: DenseGraph })),
)

export const Route = createFileRoute('/')({
  component: Home,
})

const { features } = messages.home

function Hero(): JSX.Element {
  return (
    <section className="home-hero sheet">
      <div className="hero-in">
        <div className="hero-text">
          <code>{messages.siteTitle}</code>
          <h1 className="display">{messages.home.title}</h1>
          <p className="lead hero-lead">{messages.home.lead}</p>
          <div className="install">
            <span>{messages.home.installPrompt}</span>
            <code>{messages.home.install}</code>
            <CopyButton text={messages.home.install} label={messages.home.installCopy} />
          </div>
          <div className="actions">
            <Link className="btn btn-ink" href="/docs">
              {messages.home.readDocs}
            </Link>
            <Link className="btn btn-line" href="/examples">
              {messages.home.browseExamples}
            </Link>
          </div>
        </div>
        <div className="hero-graph">
          <Suspense>
            <HeroGraph />
          </Suspense>
        </div>
      </div>
    </section>
  )
}

function Describe(): JSX.Element {
  return (
    <section className="section">
      <div className="wrap section-in split">
        <div className="split-text">
          <h2 className="section-title">{messages.home.describeTitle}</h2>
          <p className="muted-text">{inline(messages.home.describeLead)}</p>
          <ol className="steps">
            {messages.home.describeSteps.map((step) => (
              <li key={step}>
                <span>{inline(step)}</span>
              </li>
            ))}
          </ol>
          <Link className="arrow-link" href="/docs/quick-start">
            {messages.home.quickStart}
            <Icon name="arrow" />
          </Link>
        </div>
        <div className="split-code">
          <CodeTabs
            groupId="framework"
            files={[
              { label: 'Vanilla', code: describeVanilla },
              { label: 'React', code: describeReact, language: 'tsx' },
            ]}
          />
        </div>
      </div>
    </section>
  )
}

function Cell({
  title,
  tag,
  text,
  className,
  children,
}: {
  readonly title: string
  readonly tag?: string
  readonly text: string
  readonly className?: string
  readonly children?: React.ReactNode
}): JSX.Element {
  return (
    <div className={className ? `cell ${className}` : 'cell'}>
      <div className="cell-head">
        <h3>{title}</h3>
        {tag ? <span className="tag">{tag}</span> : null}
      </div>
      <p>{inline(text)}</p>
      {children}
    </div>
  )
}

function Covers(): JSX.Element {
  return (
    <section className="section">
      <div className="wrap section-in">
        <div className="section-head">
          <h2 className="section-title">{messages.home.coversTitle}</h2>
          <p>{messages.home.coversLead}</p>
        </div>
        <div className="features">
          <Cell className="span2" title={features.webgl.title} text={features.webgl.text}>
            <div className="figures">
              <Link href="/benchmark" aria-label={messages.home.figuresLink}>
                <strong className="figure-value">{formatNumber(benchmark.nodes)}</strong>
                <span>{messages.home.nodesFigure}</span>
              </Link>
              <Link href="/benchmark" aria-label={messages.home.figuresLink}>
                <strong className="figure-value">{formatNumber(benchmark.edges)}</strong>
                <span>{messages.home.edgesFigure}</span>
              </Link>
            </div>
            <div className="cell-visual sheet">
              <Suspense>
                <DenseGraph />
              </Suspense>
            </div>
          </Cell>
          <Cell title={features.typed.title} text={features.typed.text}>
            <TypedFigure />
          </Cell>
          <Cell title={features.states.title} text={features.states.text}>
            <StatesFigure />
          </Cell>
          <Cell title={features.db.title} tag={features.db.tag} text={features.db.text}>
            <CollectionFigure />
          </Cell>
          <Cell title={features.query.title} tag={features.query.tag} text={features.query.text}>
            <ExplorationFigure />
          </Cell>
          <Cell className="span2" title={features.theming.title} text={features.theming.text}>
            <Swatches />
          </Cell>
          <Cell title={features.react.title} tag={features.react.tag} text={features.react.text}>
            <div className="cell-code">
              <SourceCode code={reactSnippet} language="tsx" />
            </div>
          </Cell>
        </div>
      </div>
    </section>
  )
}

function Next(): JSX.Element {
  return (
    <section className="section">
      <div className="wrap section-in">
        <h2 className="section-title section-title-gap">{messages.home.nextTitle}</h2>
        <div className="cards">
          {messages.home.next.map((card) => (
            <Link className="next-card" href={card.href} key={card.href}>
              <strong>
                {card.title}
                <Icon name="arrow" />
              </strong>
              <span>{card.text}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function Home(): JSX.Element {
  return (
    <HomeLayout {...homeOptions()}>
      <main id="content" className="home">
        <Hero />
        <Describe />
        <Covers />
        <Next />
      </main>
      <SiteFooter />
    </HomeLayout>
  )
}
