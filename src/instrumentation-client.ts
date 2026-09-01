// Sentry client init: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { captureRouterTransitionStart, replayIntegration } from '@sentry/nextjs'
import { scrubSentryEvent } from '@/lib/sentry'

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',

    integrations: [
        replayIntegration({
            maskAllText: true,
            maskAllInputs: true,
            blockAllMedia: true,
            minReplayDuration: 5000,
        }),
    ],

    beforeSend: scrubSentryEvent,

    tracesSampleRate: 1,
    enableLogs: true,

    // Error sessions only: study data, names, and emails render as page text, so background
    // recording is a privacy risk even with masking on.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,

    debug: false,

    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

    release: process.env.RELEASE_TAG || 'unknown',
    environment: process.env.ENVIRONMENT_ID || 'development',
})

export const onRouterTransitionStart = captureRouterTransitionStart
