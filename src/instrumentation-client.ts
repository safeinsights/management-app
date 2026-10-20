// Sentry client init: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { sentryScrubOptions } from '@/lib/sentry'
import { sentryDeployOptionsFromDocument } from '@/lib/sentry-deploy'
import { z } from 'zod'

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',

    ...sentryScrubOptions,

    tracesSampleRate: 1,
    enableLogs: true,

    debug: false,

    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

    ...sentryDeployOptionsFromDocument(),
})

// Zod probes `new Function` to pick its JIT, which the CSP reports as an eval violation (OTTER-679).
z.config({ jitless: true })

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
