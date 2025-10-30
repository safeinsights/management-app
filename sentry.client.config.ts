// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { captureConsoleIntegration } from '@sentry/nextjs'

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Add optional integrations for additional features
    integrations: [
        // send console.error and console.warn logs to Sentry
        captureConsoleIntegration({
            levels: ['warn', 'error'],
        }),
        // eslint-disable-next-line import/namespace
        ...(typeof Sentry.replayIntegration === 'function'
            ? [
                  // eslint-disable-next-line import/namespace
                  Sentry.replayIntegration({
                      maskAllText: false,
                      minReplayDuration: 5000,
                  }),
              ]
            : []),
    ],

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 1,

    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: true,

    enabled: true, // process.env.NODE_ENV === 'production',

    release: process.env.RELEASE_TAG || 'unknown',
    environment: process.env.ENVIRONMENT_ID || 'development',
})
