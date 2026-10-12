import { describe, it, expect } from '@/tests/unit.helpers'
import { NavOriginParam, Routes } from './definitions'

const params = { orgSlug: 'openstax-lab', studyId: '01a0011e-b0b2-7618-9ca5-5caa61bc30d3' }
const base = `/openstax-lab/study/${params.studyId}`

describe('study routes that carry a navigation origin', () => {
    it.each([
        ['studyEdit', Routes.studyEdit, 'edit'],
        ['studySubmitted', Routes.studySubmitted, 'submitted'],
    ] as const)('%s stays a bare path without an origin', (_name, route, segment) => {
        expect(route(params)).toBe(`${base}/${segment}`)
    })

    it('appends the origin the researcher stepped back from', () => {
        expect(Routes.studyEdit({ ...params, from: 'edit-proposal' })).toBe(`${base}/edit?from=edit-proposal`)
        expect(Routes.studySubmitted({ ...params, from: 'edit-code' })).toBe(`${base}/submitted?from=edit-code`)
    })

    it('accepts only the two edit pages as an origin', () => {
        expect(NavOriginParam.safeParse('edit-code').success).toBe(true)
        expect(NavOriginParam.safeParse('dashboard').success).toBe(false)
        expect(NavOriginParam.safeParse(undefined).success).toBe(false)
    })
})
