import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { describe, expect, it } from 'vitest'
import { ClerkErrorAlert } from './clerk-errors'

describe('ClerkErrorAlert', () => {
    it('replaces the pwned-password message with the breach copy from OTTER-597', () => {
        const error = {
            errors: [
                {
                    code: 'form_password_pwned',
                    message: 'Password has been found in an online data breach.',
                    longMessage:
                        'Password has been found in an online data breach. For account safety, please use a different password.',
                },
            ],
        }

        renderWithProviders(<ClerkErrorAlert error={error} />)

        expect(screen.getByText('Compromised Password')).toBeInTheDocument()
        expect(
            screen.getByText(
                'This password was found in a database of known breached passwords and cannot be used. ' +
                    'Please choose a different password.',
            ),
        ).toBeInTheDocument()
    })

    it('falls back to the Clerk message for codes without custom copy', () => {
        const error = {
            errors: [{ code: 'form_password_length_too_short', message: 'Passwords must be 8 characters or more.' }],
        }

        renderWithProviders(<ClerkErrorAlert error={error} />)

        expect(screen.getByText('An Error Occurred')).toBeInTheDocument()
        expect(screen.getByText('Passwords must be 8 characters or more.')).toBeInTheDocument()
    })
})
