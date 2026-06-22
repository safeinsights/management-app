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

    it('routes to /submitted for APPROVED without job activity', () => {
        expect(useStudyHref('APPROVED', false, PARAMS)).toBe(`${BASE}/submitted`)
    })

    it('routes to /submitted for REJECTED without job activity', () => {
        expect(useStudyHref('REJECTED', false, PARAMS)).toBe(`${BASE}/submitted`)
    })

    it('routes to /submitted for CHANGE-REQUESTED without job activity', () => {
        expect(useStudyHref('CHANGE-REQUESTED', false, PARAMS)).toBe(`${BASE}/submitted`)
    })

    it('routes to /view for DRAFT without job activity', () => {
        expect(useStudyHref('DRAFT', false, PARAMS)).toBe(`${BASE}/view`)
    })

    // OTTER-558: a code resubmission keeps the study at APPROVED; the decision lives on the job.
    // With the dashboard query un-masking the latest *submitted* job, an APPROVED study whose
    // submitted job was change-requested must route to the post-decision view (feedback shown),
    // NOT the initial /code upload flow.
    describe('code resubmission flow (OTTER-558)', () => {
        it('routes to /view for APPROVED with a change-requested submitted job', () => {
            expect(useStudyHref('APPROVED', true, PARAMS, ['CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'])).toBe(
                `${BASE}/view`,
            )
        })

        it('routes to /view for APPROVED with a results-ready (run-complete) submitted job', () => {
            expect(useStudyHref('APPROVED', true, PARAMS, ['RUN-COMPLETE', 'CODE-SUBMITTED'])).toBe(`${BASE}/view`)
        })

        it('routes to /resubmit when the RL has an in-progress code draft, regardless of job status', () => {
            expect(
                useStudyHref('APPROVED', true, PARAMS, ['CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'], false, true),
            ).toBe(`${BASE}/resubmit`)
        })

        it('still routes to /code for an APPROVED baseline (INITIATED-only) job with no draft', () => {
            expect(useStudyHref('APPROVED', true, PARAMS, ['INITIATED'], false, false)).toBe(`${BASE}/code`)
        })
    })

    describe('post-submission flow', () => {
        it('routes to /submitted for APPROVED without job activity when agreements are not acknowledged', () => {
            expect(useStudyHref('APPROVED', false, PARAMS, undefined, false)).toBe(`${BASE}/submitted`)
        })

        it('routes to /code for APPROVED without job activity when agreements are acknowledged', () => {
            expect(useStudyHref('APPROVED', false, PARAMS, undefined, true)).toBe(`${BASE}/code`)
        })

        it('routes to /submitted for REJECTED without job activity', () => {
            expect(useStudyHref('REJECTED', false, PARAMS, undefined, true)).toBe(`${BASE}/submitted`)
        })

        it('routes to /submitted for CHANGE-REQUESTED without job activity', () => {
            expect(useStudyHref('CHANGE-REQUESTED', false, PARAMS, undefined, true)).toBe(`${BASE}/submitted`)
        })
    })
})
