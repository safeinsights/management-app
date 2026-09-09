import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    AccessDeniedError,
    ActionFailure,
    isClerkApiError,
    isActionError,
    errorToString,
    isStaleDeploymentError,
    STALE_DEPLOYMENT_MESSAGE,
} from './errors'

describe('AccessDeniedError', () => {
    it('should be an instance of Error', () => {
        const err = new AccessDeniedError({ user: 'Access Denied' })
        expect(err).toBeInstanceOf(Error)
        expect(err.message).toContain('Access Denied')
    })
})

describe('ActionFailure', () => {
    it('should handle string error in constructor', () => {
        const err = new ActionFailure('Simple error message')
        expect(err.error).toBe('Simple error message')
    })

    it('should handle object error in constructor', () => {
        const errorObj = { field1: 'Error 1', field2: 'Error 2' }
        const err = new ActionFailure(errorObj)
        expect(err.error).toEqual(errorObj)
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

describe('isActionError', () => {
    it('returns true for ActionError with string error', () => {
        const actionError = { error: 'Something went wrong' }
        expect(isActionError(actionError)).toBe(true)
    })

    it('returns true for ActionError with object error', () => {
        const actionError = { error: { field1: 'Error 1', field2: 'Error 2' } }
        expect(isActionError(actionError)).toBe(true)
    })

    it('returns false if the object does not contain error property', () => {
        expect(isActionError({})).toBe(false)
        expect(isActionError({ success: true, data: 'result' })).toBe(false)
        expect(isActionError(null)).toBe(false)
    })
})

describe('errorToString', () => {
    beforeEach(() => {
        vi.clearAllMocks()
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
        const sanitizedObj = { isSanitizedError: true, sanitizedError: { msg: 'Sanitized error message' } }
        expect(errorToString(sanitizedObj)).toBe('Msg Sanitized error message')
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
                sanitizedError: { msg: 'Sanitized from server' },
            }),
            environmentName: 'Server',
        }
        const result = errorToString(serverError)
        expect(result).toBe('Msg Sanitized from server')
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
        expect(errorToString(nonMatching)).toBe('Unknown error occurred')
    })
})

const staleDeploymentError = () => {
    const err = new Error('Server Action "7f60224d" was not found on the server.')
    err.name = 'UnrecognizedActionError'
    return err
}

describe('isStaleDeploymentError', () => {
    it('detects the error Next throws for an action id the build does not have', () => {
        expect(isStaleDeploymentError(staleDeploymentError())).toBe(true)
    })

    it('does not claim an ordinary failure is a deployment change', () => {
        expect(isStaleDeploymentError(new Error('network unreachable'))).toBe(false)
        expect(isStaleDeploymentError(new ActionFailure('study has no outputs ready'))).toBe(false)
        expect(isStaleDeploymentError({ errors: [{ code: 'form_password_incorrect', message: 'nope' }] })).toBe(false)
        expect(isStaleDeploymentError(null)).toBe(false)
        expect(isStaleDeploymentError('a string')).toBe(false)
    })
})

describe('errorToString for a stale deployment', () => {
    it('replaces the framework text with an instruction the reviewer can act on', () => {
        const result = errorToString(staleDeploymentError())

        expect(result).toBe(STALE_DEPLOYMENT_MESSAGE)
        expect(result).not.toContain('Server Action')
        expect(result).not.toContain('UnrecognizedActionError')
    })
})
