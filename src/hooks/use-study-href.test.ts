import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { useStudyHref } from './use-study-href'

const PARAMS = { orgSlug: 'test-org', studyId: faker.string.uuid() }
const BASE = `/${PARAMS.orgSlug}/study/${PARAMS.studyId}`

describe('useStudyHref', () => {
    it('routes to /code for APPROVED with only baseline job', () => {
        expect(useStudyHref('APPROVED', true, PARAMS, ['INITIATED'])).toBe(`${BASE}/code`)
    })

    it('routes to /view for APPROVED after code has been submitted', () => {
        expect(useStudyHref('APPROVED', true, PARAMS, ['INITIATED', 'CODE-SUBMITTED'])).toBe(`${BASE}/view`)
    })

    it('routes to /view for other statuses with job activity', () => {
        expect(useStudyHref('PENDING-REVIEW', true, PARAMS)).toBe(`${BASE}/view`)
        expect(useStudyHref('REJECTED', true, PARAMS)).toBe(`${BASE}/view`)
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
