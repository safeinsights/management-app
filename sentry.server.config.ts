// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { consoleLoggingIntegration } from '@sentry/nextjs'
import { sentryInitOptions } from '@/lib/sentry'

Sentry.init({
    ...sentryInitOptions({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        release: process.env.RELEASE_TAG || 'unknown',
        environment: process.env.ENVIRONMENT_ID || 'development',
    }),

    integrations: [
        // send console.error and console.warn logs to Sentry
        consoleLoggingIntegration({ levels: ['error', 'warn'] }),
    ],

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,
})
