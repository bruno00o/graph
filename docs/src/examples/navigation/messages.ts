const numbers = new Intl.NumberFormat('en-US')

export const glideMessages = {
  glide: (duration: number) =>
    duration > 0 ? `Wheel glide: ${numbers.format(duration)} ms` : 'Wheel glide: off',
} as const
