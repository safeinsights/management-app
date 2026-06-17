import { describe, expect, it } from 'vitest'
import { parseAuthFailureReason } from './auth-failure'

describe('parseAuthFailureReason', () => {
    it('parses a known code with message', () => {
        expect(parseAuthFailureReason('STUDY_NOT_EDITABLE: study is not editable (status: APPROVED)')).toEqual({
            code: 'STUDY_NOT_EDITABLE',
            message: 'study is not editable (status: APPROVED)',
        })
    })

    it('returns UNKNOWN for an unrecognised prefix', () => {
        expect(parseAuthFailureReason('SOMETHING_NEW: new failure mode')).toEqual({
            code: 'UNKNOWN',
            message: 'new failure mode',
        })
    })

    it('returns UNKNOWN when there is no colon', () => {
        expect(parseAuthFailureReason('rejected by server')).toEqual({ code: 'UNKNOWN', message: 'rejected by server' })
    })

    it('returns UNKNOWN for empty / null reason', () => {
        expect(parseAuthFailureReason('')).toEqual({ code: 'UNKNOWN', message: 'unknown' })
        expect(parseAuthFailureReason(null)).toEqual({ code: 'UNKNOWN', message: 'unknown' })
        expect(parseAuthFailureReason(undefined)).toEqual({ code: 'UNKNOWN', message: 'unknown' })
    })

    it('parses INFRA_UNAVAILABLE as a recoverable (non-terminal) code', () => {
        expect(parseAuthFailureReason('INFRA_UNAVAILABLE: password authentication failed')).toEqual({
            code: 'INFRA_UNAVAILABLE',
            message: 'password authentication failed',
        })
    })

    it('round-trips every known code', () => {
        const codes = [
            'MISSING_TOKEN',
            'INVALID_TOKEN',
            'UNRECOGNIZED_DOCUMENT',
            'USER_NOT_PROVISIONED',
            'STUDY_NOT_FOUND',
            'NO_MEMBERSHIP',
            'STUDY_NOT_EDITABLE',
            'INFRA_UNAVAILABLE',
        ] as const
        for (const code of codes) {
            expect(parseAuthFailureReason(`${code}: any message`)).toEqual({ code, message: 'any message' })
        }
    })
})
