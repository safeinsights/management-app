// Safe to import from both client and server components.
// process.env.NODE_ENV is statically inlined into the client bundle by Next.js,
// so IS_DEV becomes a literal constant at build time on the client.

export const IS_DEV = process.env.NODE_ENV === 'development'
export const IS_CI = process.env.NEXT_PUBLIC_CI === 'true'

// When set, editors render a standalone single-user surface (no Yjs/Hocuspocus
// collaboration) and the realtime websocket is never opened. For deployments
// where only one person edits a study at a time and the collaboration server
// isn't available.
export const IS_SINGLE_USER_EDITING = process.env.NEXT_PUBLIC_SINGLE_USER_EDITING === 'true'

export const WS_URL = IS_DEV || IS_CI ? 'ws://localhost:4001' : '/ws'
