import {
  type JSX,
  type ReactNode,
  type RefObject,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react'

export function useVisible<T extends Element>(ref: RefObject<T | null>, enabled = true): boolean {
  const [visible, setVisible] = useState(!enabled)
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, enabled])
  return visible
}

export function WhenVisible({
  className,
  children,
}: {
  readonly className: string
  readonly children: ReactNode
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const visible = useVisible(box)
  return (
    <div ref={box} className={className}>
      {visible ? <Suspense>{children}</Suspense> : null}
    </div>
  )
}
