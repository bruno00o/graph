export const messages = {
  graphLabel: 'Chain of twenty-four nodes whose size follows a value from 4 to 96',
  value: (value: number) => String(value),
  mode: (name: string) => `Size scale: ${name}`,
  modes: {
    sqrt: 'square root, area follows the value',
    linear: 'linear, diameter follows the value',
    identity: 'identity, the value is the diameter',
  },
} as const
