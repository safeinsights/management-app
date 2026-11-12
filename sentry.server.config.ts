// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { sentryScrubOptions } from '@/lib/sentry'
import { sentryDeployOptionsFromEnv } from '@/lib/sentry-deploy'

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // No consoleLoggingIntegration: Sentry 11 has no enableLogs switch, the integration is what ships
    // logs, and server log export stays off until InfoSec approves it (OTTER-707).

    ...sentryScrubOptions,

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

    ...sentryDeployOptionsFromEnv(process.env),
})
