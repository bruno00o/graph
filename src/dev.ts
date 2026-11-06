declare const process: { readonly env: { readonly NODE_ENV?: string } }

function detect(): boolean {
  try {
    return process.env.NODE_ENV !== 'production'
  } catch {
    return false
  }
}

export const dev: boolean = detect()
