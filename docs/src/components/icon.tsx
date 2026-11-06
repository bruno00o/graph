import type { JSX } from 'react'

const paths = {
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </>
  ),
  moon: <path d="M13.5 9.6A5.5 5.5 0 1 1 6.4 2.5a4.5 4.5 0 0 0 7.1 7.1z" />,
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
      <path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </>
  ),
  check: <path d="M3 8.5l3 3 7-7" />,
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  fit: (
    <>
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  expand: <path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9" />,
  arrow: <path d="M3 8h10M9 4l4 4-4 4" />,
  back: <path d="M13 8H3M7 4L3 8l4 4" />,
  menu: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />,
  close: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  chevron: <path d="M4 6l4 4 4-4" />,
  restart: (
    <>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
      <path d="M2.5 2.5v3h3" />
    </>
  ),
  external: (
    <path d="M9.5 2.5h4v4M13.5 2.5L8 8M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
  ),
  npm: (
    <>
      <rect x="1.5" y="4.5" width="13" height="6" rx="0.5" />
      <path d="M4 10.5v-4h2.5v4M9 6.5v5.5M9 6.5h2.5v4" />
    </>
  ),
} as const

export type IconName = keyof typeof paths

export function Icon({
  name,
  size = 16,
  className,
}: {
  readonly name: IconName
  readonly size?: number
  readonly className?: string
}): JSX.Element {
  return (
    <svg
      className={className ? `ic ${className}` : 'ic'}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
