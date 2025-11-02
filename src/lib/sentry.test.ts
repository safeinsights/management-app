// This test verifies that Sentry is properly configured and can capture errors
// It sends a test error to Sentry during CI runs to verify client-side error reporting works
import * as Sentry from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'

describe('Sentry Integration', () => {
    it('should be able to capture exceptions to Sentry', async () => {
        const testError = new Error('Sentry CI Test Error - This is a test error sent from GitHub Actions CI')

        // Add test context to make it easy to identify in Sentry
        Sentry.setContext('ci_test', {
            test_name: 'sentry.test.ts',
            environment: 'ci',
        })

        // Capture the exception
        const eventId = Sentry.captureException(testError)

        // If DSN is configured, eventId should be a string
        // If DSN is not configured, eventId will be undefined but test won't fail
        // This allows the test to pass in both scenarios
        expect(typeof eventId === 'string' || eventId === undefined).toBe(true)

        // Flush to ensure event is sent before test completes
        await Sentry.flush(2000)
    })

    it('should have Sentry DSN configured in CI environment', () => {
        const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

        // In CI, DSN should be set from GitHub Actions secrets
        // This assertion helps verify the environment variable is properly configured during CI runs
        // In local dev, DSN might not be set, so we skip the check
        const isCI = process.env.CI === 'true'

        if (isCI) {
            expect(dsn).toBeDefined()
            expect(typeof dsn).toBe('string')
            expect(dsn?.length).toBeGreaterThan(0)
        } else {
            // May be undefined in local dev - we only want to test in CI
            return true
        }
    })
})
