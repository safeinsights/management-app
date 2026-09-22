// Sentry client init: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { captureRouterTransitionStart, replayIntegration } from '@sentry/nextjs'
import { sentryInitOptions } from '@/lib/sentry'

Sentry.init({
    ...sentryInitOptions({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
        release: process.env.RELEASE_TAG || 'unknown',
        environment: process.env.ENVIRONMENT_ID || 'development',
    }),

    integrations: [
        replayIntegration({
            maskAllText: true,
            maskAllInputs: true,
            blockAllMedia: true,
            minReplayDuration: 5000,
        }),
    ],

    tracesSampleRate: 1,
    enableLogs: true,

    // Error sessions only: study data, names, and emails render as page text, so background
    // recording is a privacy risk even with masking on.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
})

export const onRouterTransitionStart = captureRouterTransitionStart
