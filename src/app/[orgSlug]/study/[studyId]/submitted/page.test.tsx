import { describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { db } from '@/database'
import type { StudyJobStatus } from '@/database/types'
import {
    insertTestOrg,
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
const insertDecidedCodeStudy = async (statuses: readonly StudyJobStatus[]) => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
    const { study, job } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })
    for (const status of statuses) await insertStatus(job.id, status)
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
    it.each([
        ['returns to Edit code when the step back came from it', ['CODE-CHANGES-REQUESTED'], 'edit-code', 'edit-code'],
        [
            'returns to Edit code after a feedback-only outputs decision',
            ['CODE-APPROVED', 'RUN-COMPLETE', 'FILES-REJECTED'],
            'edit-code',
            'edit-code',
        ],
        ['steps forward to the code step without an origin', ['CODE-CHANGES-REQUESTED'], undefined, 'code-step'],
        ['ignores an Edit code origin once the round is closed', ['CODE-APPROVED'], 'edit-code', 'code-step'],
        ['ignores an origin it does not know', ['CODE-CHANGES-REQUESTED'], 'dashboard', 'code-step'],
    ] as const)('%s', async (_name, statuses, from, target) => {
        const { org, study } = await insertDecidedCodeStudy(statuses)

        await renderSubmitted(org.slug, study.id, from)

        const params = { orgSlug: org.slug, studyId: study.id }
        const expected = target === 'edit-code' ? Routes.studyResubmit(params) : Routes.studyViewCode(params)
        expect(screen.getByTestId('cta-next-step')).toHaveAttribute('href', expected)
    })
})

// OTTER-768: `view Study` lets a Data Partner member read the study, but this is a Research Lab page.
describe('/submitted for a Data Partner member (OTTER-768)', () => {
    it('sends the member to the review page', async () => {
        vi.mocked(redirect).mockImplementation(() => {
            throw new Error('NEXT_REDIRECT')
        })
        const { org: enclave } = await mockSessionWithTestData({ orgType: 'enclave' })
        const lab = await insertTestOrg({ slug: `lab-${crypto.randomUUID().slice(0, 8)}`, type: 'lab' })
        const { study } = await insertTestStudyJobData({ org: enclave, submittedByOrg: lab, studyStatus: 'PENDING-REVIEW' })

        await expect(StudySubmittedRoute({ params: Promise.resolve({ orgSlug: enclave.slug, studyId: study.id }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT')
        expect(redirect).toHaveBeenCalledWith(Routes.studyReview({ orgSlug: enclave.slug, studyId: study.id }))
    })
})
