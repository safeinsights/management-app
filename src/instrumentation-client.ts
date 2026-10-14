// Sentry client init: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { captureRouterTransitionStart } from '@sentry/nextjs'
import { sentryScrubOptions } from '@/lib/sentry'

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',

    ...sentryScrubOptions,

    tracesSampleRate: 1,
    enableLogs: true,

    debug: false,

    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

    release: process.env.RELEASE_TAG || 'unknown',
    environment: process.env.ENVIRONMENT_ID || 'development',
})

export const onRouterTransitionStart = captureRouterTransitionStart
