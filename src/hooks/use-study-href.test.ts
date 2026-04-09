import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { useStudyHref } from './use-study-href'

const PARAMS = { orgSlug: 'test-org', studyId: faker.string.uuid() }
const BASE = `/${PARAMS.orgSlug}/study/${PARAMS.studyId}`

describe('useStudyHref', () => {
    it('routes based on status when there is job activity', () => {
        expect(useStudyHref('PENDING-REVIEW', true, PARAMS)).toBe(`${BASE}/view`)
        expect(useStudyHref('APPROVED', true, PARAMS)).toBe(`${BASE}/code`)
        expect(useStudyHref('REJECTED', true, PARAMS)).toBe(`${BASE}/view`)
    })

    it('routes to /view for PENDING-REVIEW without job activity', () => {
        expect(useStudyHref('PENDING-REVIEW', false, PARAMS)).toBe(`${BASE}/view`)
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
