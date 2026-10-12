import { describe, it, expect } from 'vitest'
import { db } from '@/database'
import type { StudyJobStatus } from '@/database/types'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
} from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import StudySubmittedRoute from './page'

const insertStatus = (studyJobId: string, status: StudyJobStatus) =>
    db.insertInto('jobStatusChange').values({ studyJobId, status }).execute()

// A study whose code was submitted and then decided, so /submitted is the approved proposal reached by
// walking back from the code step.
const insertDecidedCodeStudy = async (decision: StudyJobStatus) => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
    const { study, job } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })
    await insertStatus(job.id, decision)
    return { org, study }
}

const renderSubmitted = async (orgSlug: string, studyId: string, from?: string) => {
    const page = await StudySubmittedRoute({
        params: Promise.resolve({ orgSlug, studyId }),
        searchParams: Promise.resolve({ from }),
    })
    renderWithProviders(page)
}

describe('StudySubmittedRoute (/submitted)', () => {
    it('exits "Back to my studies" to My studies for a declined proposal', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'REJECTED')

        await renderSubmitted(org.slug, study.id)

        expect(screen.getByTestId('cta-back-to-my-studies')).toHaveAttribute('href', Routes.dashboard)
    })

    // OTTER-673: Edit code's "Previous step" lands here, and "Next step" has to return to Edit code.
    it('steps forward to Edit code when the step back came from Edit code', async () => {
        const { org, study } = await insertDecidedCodeStudy('CODE-CHANGES-REQUESTED')

        await renderSubmitted(org.slug, study.id, 'edit-code')

        expect(screen.getByTestId('cta-next-step')).toHaveAttribute(
            'href',
            Routes.studyResubmit({ orgSlug: org.slug, studyId: study.id }),
        )
    })

    it('steps forward to the code step when the step back came from the code step', async () => {
        const { org, study } = await insertDecidedCodeStudy('CODE-CHANGES-REQUESTED')

        await renderSubmitted(org.slug, study.id)

        expect(screen.getByTestId('cta-next-step')).toHaveAttribute(
            'href',
            Routes.studyViewCode({ orgSlug: org.slug, studyId: study.id }),
        )
    })

    it('ignores an Edit code origin once the round can no longer be resubmitted', async () => {
        const { org, study } = await insertDecidedCodeStudy('CODE-APPROVED')

        await renderSubmitted(org.slug, study.id, 'edit-code')

        expect(screen.getByTestId('cta-next-step')).toHaveAttribute(
            'href',
            Routes.studyViewCode({ orgSlug: org.slug, studyId: study.id }),
        )
    })

    it('ignores an origin it does not know', async () => {
        const { org, study } = await insertDecidedCodeStudy('CODE-CHANGES-REQUESTED')

        await renderSubmitted(org.slug, study.id, 'dashboard')

        expect(screen.getByTestId('cta-next-step')).toHaveAttribute(
            'href',
            Routes.studyViewCode({ orgSlug: org.slug, studyId: study.id }),
        )
    })
})
