// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { captureRouterTransitionStart, replayIntegration } from '@sentry/nextjs'

// Guard to prevent multiple initializations (e.g., during HMR)
let isInitialized = false
let pollingInterval: NodeJS.Timeout | null = null

// window.SENTRY_DSN is set at runtime via a <script> tag in layout.tsx with strategy="beforeInteractive"
// We need to wait for the script to execute before initializing Sentry
function initializeSentry() {
    // Prevent multiple initializations
    if (isInitialized) {
        return
    }

    // Check if Sentry is already initialized by checking for an existing client
    if (Sentry.getClient()) {
        isInitialized = true
        return
    }

    const sentryDsn = typeof window !== 'undefined' ? window.SENTRY_DSN : undefined

    Sentry.init({
        dsn: sentryDsn,

        // Add optional integrations for additional features
        integrations: [
            replayIntegration({
                maskAllText: false,
                minReplayDuration: 5000,
            }),
        ],

        // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
        tracesSampleRate: 1,
        // Enable logs to be sent to Sentry
        enableLogs: true,

        // Define how likely Replay events are sampled.
        // This sets the sample rate to be 10%. You may want this to be 100% while
        // in development and sample at a lower rate in production
        replaysSessionSampleRate: 1.0,

        // Define how likely Replay events are sampled when an error occurs.
        replaysOnErrorSampleRate: 1.0,

        // Setting this option to true will print useful information to the console while you're setting up Sentry.
        debug: false,

        enabled: Boolean(sentryDsn),

        release: process.env.RELEASE_TAG || 'unknown',
        environment: process.env.ENVIRONMENT_ID || 'development',
    })

    isInitialized = true
}

// Wait for window.SENTRY_DSN to be set by the layout script
if (typeof window !== 'undefined') {
    // Clear any existing polling interval
    if (pollingInterval) {
        clearInterval(pollingInterval)
        pollingInterval = null
    }

    if (window.SENTRY_DSN) {
        // Already available, initialize immediately
        initializeSentry()
    } else if (!isInitialized && !Sentry.getClient()) {
        // Wait for the script to set it (with a timeout)
        let attempts = 0
        const maxAttempts = 30 // 3 seconds max wait
        pollingInterval = setInterval(() => {
            attempts++
            if (window.SENTRY_DSN || attempts >= maxAttempts) {
                clearInterval(pollingInterval!)
                pollingInterval = null
                if (attempts >= maxAttempts) {
                    console.warn('Timeout waiting for SENTRY_DSN, initializing without DSN')
                }
                initializeSentry()
            }
        }, 100)
    }
}

export const onRouterTransitionStart = captureRouterTransitionStart
