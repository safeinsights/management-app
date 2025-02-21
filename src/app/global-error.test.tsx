import { render } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import GlobalError from './global-error'
import * as Sentry from '@sentry/nextjs'

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}))

describe('GlobalError Component', () => {
    it('calls Sentry.captureException with the error and renders NextError', () => {
        const testError = new Error('Test error')

        render(<GlobalError error={testError} />, { container: document })

        // Verify that captureException is called with the error
        expect(Sentry.captureException).toHaveBeenCalledWith(testError)
    })
})
