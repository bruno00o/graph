import { type Collection, createCollection } from '@tanstack/db'

export interface Spot {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
  readonly x: number
  readonly y: number
}

export interface Server {
  readonly spots: Collection<Spot, string>
  refuse: boolean
  save(rows: readonly Spot[]): Promise<void>
}

export function createServer(initial: readonly Spot[], latency: number): Server {
  let deliver: (rows: readonly Spot[]) => void = () => {}
  const spots = createCollection<Spot, string>({
    getKey: (spot) => spot.id,
    sync: {
      sync: ({ begin, write, commit, markReady }) => {
        begin()
        for (const row of initial) write({ type: 'insert', value: row })
        commit()
        markReady()
        deliver = (rows) => {
          begin()
          for (const row of rows) write({ type: 'update', value: row })
          commit()
        }
        return () => {
          deliver = () => {}
        }
      },
    },
  })
  const server: Server = {
    spots,
    refuse: false,
    async save(rows) {
      const refused = server.refuse
      await new Promise((resolve) => setTimeout(resolve, latency))
      if (refused) throw new Error('refused')
      deliver(rows)
    },
  }
  return server
}
