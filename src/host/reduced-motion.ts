let reducedMotionQuery: MediaQueryList | undefined

export function reducedMotion(): boolean {
  reducedMotionQuery ??= window.matchMedia?.('(prefers-reduced-motion: reduce)')
  return reducedMotionQuery?.matches ?? false
}
