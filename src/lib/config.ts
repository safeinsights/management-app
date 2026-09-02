// Safe to import from both client and server components: Next.js statically inlines
// process.env.NODE_ENV into the client bundle.

export const IS_DEV = process.env.NODE_ENV === 'development'
export const IS_CI = process.env.NEXT_PUBLIC_CI === 'true'

export const WS_URL = IS_DEV || IS_CI ? 'ws://localhost:4001' : '/ws'

export const SAFE_INSIGHTS_SLACK_URL = 'https://openstax.slack.com/archives/C081BN1R8CE'
