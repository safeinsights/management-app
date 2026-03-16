import { StudyJobStatus } from '@/database/types'
import { describe, expect, it } from 'vitest'
import { computeNeedsAttention } from './compute-needs-attention'

const makeStudy = (status: string, jobStatuses: string[] = []) => ({
    id: 'study-1',
    status,
    researcherId: 'researcher-1',
    jobStatusChanges: jobStatuses.map((s) => ({ status: s as StudyJobStatus })),
})

describe('computeNeedsAttention', () => {
    describe('researcher audience', () => {
        it('returns true for APPROVED study never viewed', () => {
            const result = computeNeedsAttention(makeStudy('APPROVED'), 'researcher', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns true for REJECTED study never viewed', () => {
            const result = computeNeedsAttention(makeStudy('REJECTED'), 'researcher', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns false for PENDING-REVIEW study (not a researcher attention status)', () => {
            const result = computeNeedsAttention(makeStudy('PENDING-REVIEW'), 'researcher', undefined, undefined)
            expect(result).toBe(false)
        })

        it('returns false for DRAFT study', () => {
            const result = computeNeedsAttention(makeStudy('DRAFT'), 'researcher', undefined, undefined)
            expect(result).toBe(false)
        })

        it('returns true for study with CODE-APPROVED job status never viewed', () => {
            const study = makeStudy('APPROVED', ['CODE-APPROVED'])
            const result = computeNeedsAttention(study, 'researcher', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns true for study with CODE-REJECTED job status never viewed', () => {
            const study = makeStudy('APPROVED', ['CODE-REJECTED'])
            const result = computeNeedsAttention(study, 'researcher', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns true for study with JOB-ERRORED job status never viewed', () => {
            const study = makeStudy('APPROVED', ['JOB-ERRORED'])
            const result = computeNeedsAttention(study, 'researcher', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns true for study with FILES-APPROVED job status never viewed', () => {
            const study = makeStudy('APPROVED', ['FILES-APPROVED'])
            const result = computeNeedsAttention(study, 'researcher', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns true for study with FILES-REJECTED job status never viewed', () => {
            const study = makeStudy('APPROVED', ['FILES-REJECTED'])
            const result = computeNeedsAttention(study, 'researcher', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns false when viewed after the latest status change', () => {
            const statusChangeAt = new Date('2024-01-01')
            const viewedAt = new Date('2024-01-02')
            const viewRecord = { studyId: 'study-1', viewedAt }
            const result = computeNeedsAttention(makeStudy('APPROVED'), 'researcher', viewRecord, statusChangeAt)
            expect(result).toBe(false)
        })

        it('returns true when viewed before the latest status change', () => {
            const viewedAt = new Date('2024-01-01')
            const statusChangeAt = new Date('2024-01-02')
            const viewRecord = { studyId: 'study-1', viewedAt }
            const result = computeNeedsAttention(makeStudy('APPROVED'), 'researcher', viewRecord, statusChangeAt)
            expect(result).toBe(true)
        })

        it('returns false when viewed but no status change timestamp (study-level change without job)', () => {
            const viewRecord = { studyId: 'study-1', viewedAt: new Date('2024-01-01') }
            const result = computeNeedsAttention(makeStudy('APPROVED'), 'researcher', viewRecord, undefined)
            expect(result).toBe(false)
        })
    })

    describe('reviewer audience', () => {
        it('returns true for PENDING-REVIEW study never viewed', () => {
            const result = computeNeedsAttention(makeStudy('PENDING-REVIEW'), 'reviewer', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns false for APPROVED study (not a reviewer attention status)', () => {
            const result = computeNeedsAttention(makeStudy('APPROVED'), 'reviewer', undefined, undefined)
            expect(result).toBe(false)
        })

        it('returns true for study with CODE-SUBMITTED job status never viewed', () => {
            const study = makeStudy('APPROVED', ['CODE-SUBMITTED'])
            const result = computeNeedsAttention(study, 'reviewer', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns true for study with JOB-ERRORED job status never viewed', () => {
            const study = makeStudy('APPROVED', ['JOB-ERRORED'])
            const result = computeNeedsAttention(study, 'reviewer', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns true for study with RUN-COMPLETE job status never viewed', () => {
            const study = makeStudy('APPROVED', ['RUN-COMPLETE'])
            const result = computeNeedsAttention(study, 'reviewer', undefined, undefined)
            expect(result).toBe(true)
        })

        it('returns false when viewed after the latest status change', () => {
            const statusChangeAt = new Date('2024-01-01')
            const viewedAt = new Date('2024-01-02')
            const viewRecord = { studyId: 'study-1', viewedAt }
            const result = computeNeedsAttention(makeStudy('PENDING-REVIEW'), 'reviewer', viewRecord, statusChangeAt)
            expect(result).toBe(false)
        })

        it('returns true when viewed before the latest status change', () => {
            const viewedAt = new Date('2024-01-01')
            const statusChangeAt = new Date('2024-01-02')
            const viewRecord = { studyId: 'study-1', viewedAt }
            const result = computeNeedsAttention(makeStudy('PENDING-REVIEW'), 'reviewer', viewRecord, statusChangeAt)
            expect(result).toBe(true)
        })
    })
})
