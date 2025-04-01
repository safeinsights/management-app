import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { notifications } from '@mantine/notifications'
import React from 'react'

import {
    isClerkApiError,
    isServerActionError,
    errorToString,
    reportError,
    ErrorAlert,
    AccessDeniedAlert,
    AlertNotFound,
} from './errors'

describe('isClerkApiError', () => {
    it('returns true for a valid Clerk API error object', () => {
        const clerkError = {
            errors: [
                {
                    meta: { paramName: 'email' },
                    code: 'INVALID_EMAIL',
                    message: 'Invalid email',
                    longMessage: 'The provided email address is invalid.',
                },
            ],
        }
        expect(isClerkApiError(clerkError)).toBe(true)
    })

    it('returns false for non-object values', () => {
        expect(isClerkApiError(null)).toBe(false)
        expect(isClerkApiError('error')).toBe(false)
        expect(isClerkApiError(42)).toBe(false)
    })

    it('returns false when errors property is missing or invalid', () => {
        expect(isClerkApiError({})).toBe(false)
        expect(isClerkApiError({ errors: 'not an array' })).toBe(false)
        expect(isClerkApiError({ errors: [{}] })).toBe(false)
    })
})

describe('isServerActionError', () => {
    it('returns true for a valid ServerActionError object', () => {
        const serverError = {
            digest: 'abc123',
            name: 'ServerError',
            Error: 'Something went wrong',
            environmentName: 'Server',
        }
        expect(isServerActionError(serverError)).toBe(true)
    })

    it('returns false for non-server errors', () => {
        expect(isServerActionError(null)).toBe(false)
        expect(isServerActionError({})).toBe(false)
        expect(isServerActionError({ environmentName: 'Client' })).toBe(false)
    })
})

describe('errorToString', () => {
    it('returns an empty string for falsy errors', () => {
        expect(errorToString(null)).toBe('')
        expect(errorToString(undefined)).toBe('')
    })

    it('returns the string itself if error is a string', () => {
        const err = 'Simple error message'
        expect(errorToString(err)).toBe(err)
    })

    it('returns formatted message for a ServerActionError', () => {
        const serverError = {
            digest: 'digest123',
            name: 'ServerError',
            Error: 'Error on server',
            environmentName: 'Server',
        }
        expect(errorToString(serverError)).toBe(
            `An unexpected error occurred on the server.\nDigest: ${serverError.digest}`,
        )
    })

    it('returns concatenated error messages for a ClerkApiError', () => {
        const clerkError = {
            errors: [
                {
                    meta: { paramName: 'username' },
                    code: 'ERR_USERNAME',
                    message: 'Username error',
                    longMessage: 'The username is invalid.',
                },
                {
                    meta: { paramName: 'password' },
                    code: 'ERR_PASSWORD',
                    message: 'Password error',
                    longMessage: 'The password is too weak.',
                },
            ],
        }
        expect(errorToString(clerkError)).toBe(
            'Username error: The username is invalid.\nPassword error: The password is too weak.',
        )
    })

    it('returns the Error instance string if error is an instance of Error', () => {
        const errorInstance = new Error('Instance error')
        expect(errorToString(errorInstance)).toBe(errorInstance.toString())
    })
})

describe('reportError', () => {
    const notificationsShowSpy = vi.spyOn(notifications, 'show').mockImplementation(() => '')

    it('calls notifications.show with the default title and error message', () => {
        const errorMsg = 'Test error'
        reportError(errorMsg)
        expect(notificationsShowSpy).toHaveBeenCalledWith({
            color: 'red',
            title: 'An error occurred',
            message: errorMsg,
        })
    })

    it('calls notifications.show with a custom title if provided', () => {
        const errorInstance = new Error('Custom error')
        const customTitle = 'Custom Title'
        reportError(errorInstance, customTitle)
        expect(notificationsShowSpy).toHaveBeenCalledWith({
            color: 'red',
            title: customTitle,
            message: errorInstance.toString(),
        })
    })
})

describe('ErrorAlert Component', () => {
    it('renders the error message and default title', () => {
        renderWithProviders(<ErrorAlert error="Test error" />)
        expect(screen.getByText('Test error')).toBeDefined()
        expect(screen.getByText('An error occurred')).toBeDefined()
    })

    it('renders error when error is an Error instance', () => {
        const err = new Error('Instance error')
        renderWithProviders(<ErrorAlert error={err} />)
        expect(screen.getByText(err.toString())).toBeDefined()
    })
})

describe('AccessDeniedAlert Component', () => {
    it('renders the default access denied message and title', () => {
        renderWithProviders(<AccessDeniedAlert />)
        expect(screen.getByText('Access Denied')).toBeDefined()
        expect(screen.getByText('You do not have permission to access this resource.')).toBeDefined()
    })

    it('renders a custom message if provided', () => {
        const customMessage = 'Custom access message'
        renderWithProviders(<AccessDeniedAlert message={customMessage} />)
        expect(screen.getByText(customMessage)).toBeDefined()
    })
})

describe('AlertNotFound Component', () => {
    it('renders nothing if hideIf is true', () => {
        const { queryByText } = renderWithProviders(
            <AlertNotFound title="Not Found" message="Content missing" hideIf={true} />,
        )
        expect(queryByText('Content missing')).toBeNull()
    })

    it('renders alert with given title and message when hideIf is false', () => {
        renderWithProviders(<AlertNotFound title="Not Found" message="Content missing" hideIf={false} />)
        expect(screen.getByText('Not Found')).toBeDefined()
        expect(screen.getByText('Content missing')).toBeDefined()
    })
})
