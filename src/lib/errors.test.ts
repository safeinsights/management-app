// errorUtils.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    AccessDeniedError,
    SanitizedError,
    isClerkApiError,
    isSanitizedError,
    isServerActionError,
    errorToString,
} from './errors'

describe('AccessDeniedError', () => {
    it('should be an instance of Error', () => {
        const err = new AccessDeniedError('Access Denied')
        expect(err).toBeInstanceOf(Error)
        expect(err.message).toBe('Access Denied')
    })
})

describe('SanitizedError', () => {
    it('should set its message as a JSON string with sanitized properties', () => {
        const err = new SanitizedError('Safe error message')
        // The message is a JSON string; parse it to verify its contents
        const parsed = JSON.parse(err.message)
        expect(parsed).toEqual({
            isSanitizedError: true,
            sanitizedErrorMessage: 'Safe error message',
        })
    })
})

describe('isClerkApiError', () => {
    it('returns true for a valid Clerk API error object', () => {
        const clerkError = {
            errors: [
                {
                    code: 'CLERK_ERR',
                    message: 'Something went wrong',
                    longMessage: 'Detailed error information',
                },
            ],
        }
        expect(isClerkApiError(clerkError)).toBe(true)
    })

    it('returns false for invalid objects', () => {
        expect(isClerkApiError(null)).toBe(false)
        expect(isClerkApiError({})).toBe(false)
        expect(isClerkApiError({ errors: 'not an array' })).toBe(false)
        expect(isClerkApiError({ errors: [{}] })).toBe(false)
    })
})

describe('isServerActionError', () => {
    it('returns true when error is a valid server action error', () => {
        const serverError = {
            digest: '123',
            name: 'TestError',
            Error: 'Error',
            message: 'Server action error message',
            environmentName: 'Server',
        }
        expect(isServerActionError(serverError)).toBe(true)
    })

    it('returns false for non-server errors', () => {
        expect(isServerActionError({})).toBe(false)
        expect(isServerActionError({ environmentName: 'Client' })).toBe(false)
        expect(isServerActionError(null)).toBe(false)
    })
})

describe('isSanitizedError', () => {
    it('returns true for an object with sanitized error properties', () => {
        const sanitizedObj = { isSanitizedError: true, sanitizedErrorMessage: 'Safe message' }
        expect(isSanitizedError(sanitizedObj)).toBe(true)
    })

    it('returns true for a server action error with a valid JSON message containing a sanitized error', () => {
        const serverError = {
            digest: 'abc',
            name: 'TestError',
            Error: 'Error',
            message: JSON.stringify({
                isSanitizedError: true,
                sanitizedErrorMessage: 'Server safe message',
            }),
            environmentName: 'Server',
        }
        expect(isSanitizedError(serverError)).toBe(true)
    })

    it('returns false if the object does not contain the proper sanitized error properties', () => {
        expect(isSanitizedError({})).toBe(false)
        expect(isSanitizedError({ isSanitizedError: false, sanitizedErrorMessage: 'Not safe' })).toBe(false)
    })
})

describe('errorToString', () => {
    beforeEach(() => {
        vi.clearAllMocks() // Clear mocks before each test
    })

    it('returns an empty string for falsy errors', () => {
        expect(errorToString(null)).toBe('')
        expect(errorToString(undefined)).toBe('')
        expect(errorToString(0)).toBe('')
    })

    it('returns the error string when a string is provided', () => {
        expect(errorToString('A simple error string')).toBe('A simple error string')
    })

    it('returns the sanitized error message when provided an object with sanitized error properties', () => {
        const sanitizedObj = { isSanitizedError: true, sanitizedErrorMessage: 'Sanitized error message' }
        expect(errorToString(sanitizedObj)).toBe('Sanitized error message')
    })

    it('handles a server action error without a valid JSON message', () => {
        const serverError = {
            digest: '123',
            name: 'ServerError',
            Error: 'Error',
            message: 'invalid json',
            environmentName: 'Server',
        }
        const result = errorToString(serverError)
        expect(result).toBe('An unexpected error occurred on the server.\nDigest: 123')
    })

    it('handles a server action error with a valid JSON message containing a sanitized error', () => {
        const serverError = {
            digest: '456',
            name: 'ServerError',
            Error: 'Error',
            message: JSON.stringify({
                isSanitizedError: true,
                sanitizedErrorMessage: 'Sanitized from server',
            }),
            environmentName: 'Server',
        }
        const result = errorToString(serverError)
        expect(result).toBe('Sanitized from server')
        // In this case, the sanitized error is extracted before the branch that calls captureException
    })

    it('handles a Clerk API error by formatting its messages', () => {
        const clerkError = {
            errors: [
                {
                    code: 'CLERK_ERR',
                    message: 'Error occurred',
                },
            ],
        }
        expect(errorToString(clerkError)).toBe('Error occurred')
    })

    it('handles generic Error instances', () => {
        const err = new Error('Generic error')
        expect(errorToString(err)).toBe(String(err))
    })

    it('returns undefined for objects that do not match any condition', () => {
        const nonMatching = { some: 'object' }
        expect(errorToString(nonMatching)).toBeUndefined()
    })
})
