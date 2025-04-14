// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

Sentry.init({
    dsn: 'https://d4562cb5b99d711ed739824eb3a79aa2@o484761.ingest.us.sentry.io/4508129783906304',

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    enabled: process.env.NODE_ENV === 'production',

    release: process.env.RELEASE_SHA || 'unknown',
    environment: process.env.ENVIRONMENT_ID || 'development',
})
