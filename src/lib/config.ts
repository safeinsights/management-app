// Safe to import from both client and server components.
// process.env.NODE_ENV is statically inlined into the client bundle by Next.js,
// so IS_DEV becomes a literal constant at build time on the client.

export const IS_DEV = process.env.NODE_ENV === 'development'

export const WS_URL = IS_DEV ? 'ws://localhost:4001' : '/ws'
