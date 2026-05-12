// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { captureRouterTransitionStart, replayIntegration } from '@sentry/nextjs'
import { scrubSentryEvent } from '@/lib/sentry'

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',

    // Add optional integrations for additional features
    integrations: [
        replayIntegration({
            maskAllText: true,
            maskAllInputs: true,
            blockAllMedia: true,
            minReplayDuration: 5000,
        }),
    ],

    beforeSend: scrubSentryEvent,

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,
    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Replay is only captured for sessions where an error occurs, never proactively.
    // Reason: study data, names, and emails render as page text, so background recording
    // is a privacy risk even with masking on.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

    release: process.env.RELEASE_TAG || 'unknown',
    environment: process.env.ENVIRONMENT_ID || 'development',
})

export const onRouterTransitionStart = captureRouterTransitionStart
