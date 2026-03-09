import { StudyStatus } from '@/database/types'
import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { useStudyHref } from './use-study-href'

const PARAMS = { orgSlug: 'test-org', studyId: faker.string.uuid() }
const BASE = `/${PARAMS.orgSlug}/study/${PARAMS.studyId}`

describe('useStudyHref', () => {
    it('routes to /view when there is job activity regardless of status', () => {
        const statuses: StudyStatus[] = ['PENDING-REVIEW', 'APPROVED', 'REJECTED']
        for (const status of statuses) {
            expect(useStudyHref(status, true, PARAMS)).toBe(`${BASE}/view`)
        }
    })

    it('routes to /submitted for PENDING-REVIEW without job activity', () => {
        expect(useStudyHref('PENDING-REVIEW', false, PARAMS)).toBe(`${BASE}/submitted`)
    })

    it('routes to /agreements for APPROVED without job activity', () => {
        expect(useStudyHref('APPROVED', false, PARAMS)).toBe(`${BASE}/agreements`)
    })

    it('routes to /view for REJECTED without job activity', () => {
        expect(useStudyHref('REJECTED', false, PARAMS)).toBe(`${BASE}/view`)
    })

    it('routes to /view for DRAFT without job activity', () => {
        expect(useStudyHref('DRAFT', false, PARAMS)).toBe(`${BASE}/view`)
    })
})
