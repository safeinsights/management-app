import { describe, expect, it, vi, type Mock } from 'vitest'
import { deliver } from '@/server/mailgun'
import { insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { runJob } from './registry'

vi.mock('@/server/mailgun', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/mailgun')>()),
    deliver: vi.fn(),
}))

const deliverMock = deliver as unknown as Mock

describe('study-email job', () => {
    it('sends the named study email from the worker', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'APPROVED' })

        await runJob({ job: 'study-email', payload: { email: 'sendStudyProposalApprovedEmail', studyId: study.id } })

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({ template: 'vb - research proposal approved', to: user.email }),
        )
    })

    it('refuses a mailer function that is not a study email', async () => {
        await expect(
            runJob({ job: 'study-email', payload: { email: 'sendInviteEmail', studyId: 'study-1' } }),
        ).rejects.toThrow()
        expect(deliverMock).not.toHaveBeenCalled()
    })
})
