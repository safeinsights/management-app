import type React from 'react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { db, insertTestStudyOnly, mockSessionWithTestData, setTestStudyStatus } from '@/tests/unit.helpers'
import ReviewProposalPage from './page'
import { ProposalReviewView } from '../proposal-review-view'
import { PostFeedbackView } from '../post-feedback-view'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

// The page returns a ReactNode union, so narrow to an element to read `.type`.
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

    // Code submission used to flip study.status back to PENDING-REVIEW while approvedAt still
    // recorded the decision, and old rows can still look like this.
    it('renders the decided proposal feedback for a PENDING-REVIEW study whose approvedAt is set', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db
            .updateTable('study')
            .set({ status: 'PENDING-REVIEW', approvedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        const page = await callPage(org.slug, study.id)

        expect(page?.type).toBe(PostFeedbackView)
        const props = page?.props as React.ComponentProps<typeof PostFeedbackView>
        expect(props.fallback?.decision).toBe('APPROVE')
    })

    it('falls through to the editable proposal review when the proposal is not yet decided', async () => {
        // This route always wants the decided initial request, so a study with none must fall
        // through to /review rather than render blank.
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        const page = await callPage(org.slug, study.id)

        expect(page?.type).toBe(ProposalReviewView)
    })
})
