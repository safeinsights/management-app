// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { consoleLoggingIntegration } from '@sentry/nextjs'
import { sentryScrubOptions } from '@/lib/sentry'

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    integrations: [
        // Log export stays disabled until the additional server data flow receives InfoSec approval.
        consoleLoggingIntegration({ levels: ['error', 'warn'] }),
    ],

    ...sentryScrubOptions,

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Keep server log export disabled; OTTER-707 only changes scrubbing.
    enableLogs: false,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

    release: process.env.RELEASE_TAG || 'unknown',
    environment: process.env.ENVIRONMENT_ID || 'development',
})
