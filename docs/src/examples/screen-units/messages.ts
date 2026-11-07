const zooms = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const messages = {
  graphLabel: 'Five large zones sized in world units, holding small markers sized in screen pixels',
  zone: (index: number) => `Zone ${index}`,
  units: (units: 'screen' | 'world') =>
    units === 'screen' ? 'Markers: 12 screen pixels' : 'Markers: 12 world units',
  zoom: (value: number) => `Zoom ${zooms.format(value)}`,
} as const
