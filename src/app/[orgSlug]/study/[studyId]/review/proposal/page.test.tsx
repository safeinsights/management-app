import type React from 'react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { insertTestStudyOnly, mockSessionWithTestData, setTestStudyStatus } from '@/tests/unit.helpers'
import ReviewProposalPage from './page'
import { ProposalReviewView } from '../proposal-review-view'
import { PostFeedbackView } from '../post-feedback-view'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

// The page's return type is the ReactNode union (guard branches hand back JSX), so narrow to an
// element to read `.type`.
const callPage = async (orgSlug: string, studyId: string) =>
    (await ReviewProposalPage({
        params: Promise.resolve({ orgSlug, studyId }),
    })) as React.ReactElement

describe('ReviewProposalPage', () => {
    it('renders the decided proposal feedback for an APPROVED study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'APPROVED')

        const page = await callPage(org.slug, study.id)

        expect(page?.type).toBe(PostFeedbackView)
    })

    it('falls through to the editable proposal review when the proposal is not yet decided', async () => {
        // The dedicated route always wants the DECIDED initial request; a PENDING-REVIEW study has
        // none, so it must fall through to the canonical /review screen instead of rendering blank.
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        const page = await callPage(org.slug, study.id)

        expect(page?.type).toBe(ProposalReviewView)
    })
})
