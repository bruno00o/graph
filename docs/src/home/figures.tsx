import themeCss from '@bruno00o/graph/theme.css?raw'
import type { JSX } from 'react'
import { messages } from '../messages'

export function StatesFigure(): JSX.Element {
  return (
    <div className="cell-visual sheet">
      <svg
        className="gsvg"
        viewBox="0 0 360 130"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={messages.home.figures.statesFigure}
      >
        <line className="g-e w15" x1="35.4" y1="45.9" x2="24.6" y2="36.2"></line>
        <line className="g-e w15" x1="55.6" y1="47.1" x2="66.7" y2="39.2"></line>
        <circle className="g-n c0" cx="19.8" cy="31.8" r="5"></circle>
        <circle className="g-n c0" cx="72" cy="35.4" r="5"></circle>
        <circle className="g-n c1" cx="45" cy="54.6" r="12"></circle>
        <text className="g-l" x="45" y="82.6">
          Node 4
        </text>
        <text className="g-cap" x="45" y="120">
          {messages.home.figures.default}
        </text>
        <line className="g-e w15" x1="125.4" y1="45.9" x2="114.6" y2="36.2"></line>
        <line className="g-e w15" x1="145.6" y1="47.1" x2="156.7" y2="39.2"></line>
        <circle className="g-n c0" cx="109.8" cy="31.8" r="5"></circle>
        <circle className="g-n c0" cx="162" cy="35.4" r="5"></circle>
        <circle className="g-n c1" cx="135" cy="54.6" r="12"></circle>
        <circle className="g-hov" cx="135" cy="54.6" r="15"></circle>
        <text className="g-l" x="135" y="82.6">
          Node 4
        </text>
        <text className="g-cap" x="135" y="120">
          {messages.home.figures.hovered}
        </text>
        <line className="g-eh" x1="215.4" y1="45.9" x2="204.6" y2="36.2"></line>
        <line className="g-e g-ea w15" x1="215.4" y1="45.9" x2="204.6" y2="36.2"></line>
        <line className="g-e w15" x1="235.6" y1="47.1" x2="246.7" y2="39.2"></line>
        <circle className="g-n c0" cx="199.8" cy="31.8" r="5"></circle>
        <circle className="g-n c0" cx="252" cy="35.4" r="5"></circle>
        <circle className="g-halo" cx="225" cy="54.6" r="18"></circle>
        <circle className="g-n c1" cx="225" cy="54.6" r="12"></circle>
        <circle className="g-sel" cx="225" cy="54.6" r="15"></circle>
        <text className="g-l" x="225" y="82.6">
          Node 4
        </text>
        <text className="g-cap" x="225" y="120">
          {messages.home.figures.selected}
        </text>
        <g className="g-dim">
          <line className="g-e w15" x1="305.4" y1="45.9" x2="294.6" y2="36.2"></line>
          <line className="g-e w15" x1="325.6" y1="47.1" x2="336.7" y2="39.2"></line>
          <circle className="g-n c0" cx="289.8" cy="31.8" r="5"></circle>
          <circle className="g-n c0" cx="342" cy="35.4" r="5"></circle>
          <circle className="g-n c1" cx="315" cy="54.6" r="12"></circle>
        </g>
        <text className="g-cap" x="315" y="120">
          {messages.home.figures.dimmed}
        </text>
      </svg>
    </div>
  )
}

export function CollectionFigure(): JSX.Element {
  return (
    <div className="cell-visual sheet">
      <svg
        className="gsvg"
        viewBox="0 0 360 150"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={messages.home.figures.collectionFigure}
      >
        <rect className="g-panel" x="8" y="14" width="150" height="122" rx="4"></rect>
        <text className="g-mono" x="20" y="40">
          n3
        </text>
        <text className="g-mono" x="52" y="40">
          Node 3
        </text>
        <text className="g-mono" x="114" y="40">
          B
        </text>
        <rect className="g-rowhi" x="12" y="50" width="142" height="22" rx="2"></rect>
        <line className="g-rule" x1="12" y1="49" x2="154" y2="49"></line>
        <text className="g-mono" x="20" y="66">
          n7
        </text>
        <text className="g-mono" x="52" y="66">
          Node 7
        </text>
        <text className="g-mono" x="114" y="66">
          B
        </text>
        <text className="g-mono g-muted" x="132" y="66">
          ~
        </text>
        <line className="g-rule" x1="12" y1="75" x2="154" y2="75"></line>
        <text className="g-mono" x="20" y="92">
          n9
        </text>
        <text className="g-mono" x="52" y="92">
          Node 9
        </text>
        <text className="g-mono" x="114" y="92">
          D
        </text>
        <rect className="g-rowhi" x="12" y="102" width="142" height="22" rx="2"></rect>
        <line className="g-rule" x1="12" y1="101" x2="154" y2="101"></line>
        <text className="g-mono" x="20" y="118">
          n12
        </text>
        <text className="g-mono" x="52" y="118">
          Node 12
        </text>
        <text className="g-mono" x="114" y="118">
          D
        </text>
        <text className="g-mono g-muted" x="132" y="118">
          +
        </text>
        <line className="g-e w15" x1="247.8" y1="49.8" x2="284.6" y2="42.9"></line>
        <path className="g-a" d="M289.7 41.9L284 46.6L282.7 39.7Z"></path>
        <line className="g-e w15" x1="241.1" y1="62.9" x2="255" y2="92.9"></line>
        <path className="g-a" d="M257.2 97.6L251.3 93.2L257.7 90.3Z"></path>
        <line className="g-e w15" x1="273" y1="107.3" x2="311.4" y2="104.9"></line>
        <path className="g-a" d="M316.5 104.6L310.4 108.5L309.9 101.5Z"></path>
        <line className="g-e w15" x1="303.8" y1="49.3" x2="320.5" y2="90.5"></line>
        <path className="g-a" d="M322.4 95.2L316.8 90.6L323.3 87.9Z"></path>
        <circle className="g-n c2" cx="236" cy="52" r="11"></circle>
        <circle className="g-n c2" cx="300" cy="40" r="9"></circle>
        <circle className="g-n c4" cx="262" cy="108" r="10"></circle>
        <circle className="g-n c4" cx="326" cy="104" r="8"></circle>
        <circle className="g-hov" cx="326" cy="104" r="11"></circle>
        <path className="g-link" d="M158 113C190 113 280 130 314 108"></path>
      </svg>
    </div>
  )
}

export function ExplorationFigure(): JSX.Element {
  return (
    <div className="cell-visual sheet">
      <svg
        className="gsvg"
        viewBox="32.1 27.2 588.6 245.2"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={messages.home.figures.explorationFigure}
      >
        <line className="g-e w15" x1="329.2" y1="132.7" x2="380.3" y2="68.4"></line>
        <line className="g-e w15" x1="334" y1="142.5" x2="412" y2="142.3"></line>
        <line className="g-e w15" x1="329.3" y1="152.2" x2="380" y2="215.5"></line>
        <line className="g-e w15" x1="318.7" y1="154.7" x2="301.5" y2="230.9"></line>
        <line className="g-e w15" x1="310.2" y1="147.9" x2="244.6" y2="179.8"></line>
        <line className="g-e w15" x1="310.2" y1="137.1" x2="243.5" y2="105.2"></line>
        <line className="g-e w15" x1="318.7" y1="130.3" x2="300.6" y2="52.1"></line>
        <line className="g-e w15" x1="420.6" y1="138.2" x2="458.5" y2="87"></line>
        <line className="g-e w15" x1="422.4" y1="140.7" x2="481.7" y2="121.5"></line>
        <line className="g-e w15" x1="422.4" y1="143.8" x2="483.8" y2="163.3"></line>
        <line className="g-e w15" x1="420.6" y1="146.4" x2="458.3" y2="196.6"></line>
        <line className="g-e w15" x1="234.3" y1="189.4" x2="205.7" y2="241.7"></line>
        <line className="g-e w15" x1="231.3" y1="186.2" x2="176" y2="213"></line>
        <line className="g-e w15" x1="230.6" y1="181.9" x2="171.4" y2="171.8"></line>
        <line className="g-e w15" x1="385.8" y1="68.7" x2="415.3" y2="137.1"></line>
        <line className="g-e w15" x1="377.9" y1="222.4" x2="306" y2="235.6"></line>
        <circle className="g-n c1" cx="321.5" cy="142.5" r="11.5"></circle>
        <circle className="g-exp" cx="321.5" cy="142.5" r="11"></circle>
        <circle className="g-n c2" cx="383.7" cy="64" r="4.1"></circle>
        <circle className="g-n c3" cx="417.6" cy="142.3" r="4.1"></circle>
        <circle className="g-exp" cx="417.6" cy="142.3" r="3.6"></circle>
        <circle className="g-n c4" cx="384.5" cy="221.2" r="5.8"></circle>
        <circle className="g-n c5" cx="300.2" cy="236.7" r="4.4"></circle>
        <circle className="g-n c3" cx="237.7" cy="183.1" r="6.2"></circle>
        <circle className="g-exp" cx="237.7" cy="183.1" r="5.7"></circle>
        <circle className="g-n c6" cx="238.5" cy="102.8" r="4.1"></circle>
        <g className="g-load">
          <circle className="g-n c2" cx="299" cy="45" r="5.8"></circle>
        </g>
        <circle className="g-n c7" cx="462.5" cy="81.7" r="5.2"></circle>
        <circle className="g-n c7" cx="489.4" cy="119.1" r="6.5"></circle>
        <circle className="g-n c3" cx="489.5" cy="165.1" r="4.4"></circle>
        <circle className="g-n c8" cx="462.8" cy="202.6" r="6"></circle>
        <circle className="g-n c4" cx="201.6" cy="249.3" r="7.1"></circle>
        <circle className="g-n c1" cx="169.8" cy="216" r="5.4"></circle>
        <circle className="g-n c4" cx="163.3" cy="170.4" r="6.7"></circle>
      </svg>
    </div>
  )
}

const typedFields = [
  ['group', 'string'],
  ['label', 'string'],
  ['weight', 'number'],
] as const

const typedBefore = "nodes(items, { color: '"
const typedAfter = "' })"

export function TypedFigure(): JSX.Element {
  return (
    <div className="cell-visual typed" role="img" aria-label={messages.home.figures.typedFigure}>
      <div className="typed-line">
        {typedBefore}
        <span className="typed-caret" />
        {typedAfter}
      </div>
      <ul className="typed-menu">
        {typedFields.map(([name, type]) => (
          <li key={name}>
            {name}
            <span>{type}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const swatchTokens = [
  'paper',
  'ink',
  'edge',
  'accent',
  'cat-1',
  'cat-2',
  'cat-3',
  'cat-4',
  'cat-5',
  'cat-6',
  'cat-7',
  'cat-8',
  'cat-9',
  'cat-10',
  'cat-11',
  'cat-12',
] as const

function tokensOf(block: string): ReadonlyMap<string, string> {
  return new Map(
    [...block.matchAll(/--graph-([\w-]+):\s*([^;]+);/g)].map((match) => [
      match[1] ?? '',
      (match[2] ?? '').trim(),
    ]),
  )
}

const palettes = [
  { name: messages.home.light, tokens: tokensOf(/:root\s*\{([^}]*)\}/.exec(themeCss)?.[1] ?? '') },
  {
    name: messages.home.dark,
    tokens: tokensOf(/\.dark,[^{]*\{([^}]*)\}/.exec(themeCss)?.[1] ?? ''),
  },
]

export function Swatches(): JSX.Element {
  return (
    <div className="swatches">
      {palettes.map((palette) => (
        <div className="swatch-row" key={palette.name}>
          <span>{palette.name}</span>
          {swatchTokens.map((token) => (
            <span
              key={token}
              className="swatch"
              style={{ background: palette.tokens.get(token) }}
            />
          ))}
        </div>
      ))}
      <div className="swatch-row swatch-names">
        <span />
        {messages.home.figures.swatchNames.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
    </div>
  )
}
