import { db } from '@/database'
import * as mailgun from '@/server/mailer'
import { insertTestOrgStudyJobUsers } from '@/tests/unit.helpers'
import { describe, expect, it, Mock, vi } from 'vitest'
import { deliver } from './mailgun'

vi.mock('./mailgun')

const deliverMock = deliver as unknown as Mock

async function getUser(userId: string) {
    return await db
        .selectFrom('user')
        .select(['id', 'email', 'fullName'])
        .where('id', '=', userId)
        .executeTakeFirstOrThrow()
}

describe('mailgun email functions', () => {
    it('sendInviteEmail calls deliver with expected params', async () => {
        await mailgun.sendInviteEmail({ emailTo: 'gertrude@test.com', inviteId: 'test-invite-id' })
        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: 'gertrude@test.com',
                template: expect.stringContaining('welcome'),
                vars: expect.objectContaining({ inviteLink: expect.stringContaining('test-invite-id') }),
            }),
        )
    })

    it('sendStudyProposalEmails calls deliver for reviewers', async () => {
        const { study, org, user1 } = await insertTestOrgStudyJobUsers()

        const researcher = await getUser(study.researcherId)

        await mailgun.sendStudyProposalEmails(study.id)

        expect(deliver).toHaveBeenCalledWith(
            expect.objectContaining({
                bcc: expect.stringContaining(user1.email || ''),
                subject: expect.stringContaining('New study proposal'),
                template: 'vb - new research proposal',
                vars: expect.objectContaining({
                    studyTitle: study.title,
                    submittedBy: researcher.fullName,
                    studyURL: expect.stringContaining(`/${org.slug}/study/${study.id}/review`),
                }),
            }),
        )
    })

    it('sendStudyProposalApprovedEmail calls deliver for researcher', async () => {
        const { study, org } = await insertTestOrgStudyJobUsers()
        const researcher = await getUser(study.researcherId)

        await mailgun.sendStudyProposalApprovedEmail(study.id)
        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: researcher.email,
                subject: expect.stringContaining('Proposal Approved'),
                template: 'vb - research proposal approved',
                vars: expect.objectContaining({
                    fullName: researcher.fullName,
                    studyTitle: study.title,
                    submittedBy: researcher.fullName,
                    submittedTo: org.name,
                }),
            }),
        )
    })

    it('sendStudyProposalRejectedEmail calls deliver for researcher', async () => {
        const { study, org } = await insertTestOrgStudyJobUsers()
        const researcher = await getUser(study.researcherId)

        await mailgun.sendStudyProposalRejectedEmail(study.id)
        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: researcher.email,
                subject: expect.stringContaining('Proposal Rejected'),
                template: 'vb - research proposal rejected',
                vars: expect.objectContaining({
                    fullName: researcher.fullName,
                    studyTitle: study.title,
                    submittedBy: researcher.fullName,
                    submittedTo: org.name,
                    studyURL: expect.stringContaining(`/researcher/study/${study.id}/review`),
                }),
            }),
        )
    })

    it('sendResultsReadyForReviewEmail calls deliver for reviewer', async () => {
        const { study, org, user1: reviewer } = await insertTestOrgStudyJobUsers()
        await db.updateTable('study').set({ reviewerId: reviewer.id }).where('id', '=', study.id).execute()

        await mailgun.sendResultsReadyForReviewEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: reviewer.email,
                subject: expect.stringContaining('ready for review'),
                template: 'vb - encrypted results ready for review',
                vars: expect.objectContaining({
                    fullName: reviewer.fullName,
                    studyTitle: study.title,
                    submittedBy: expect.any(String),
                    studyURL: expect.stringContaining(`/${org.slug}/study/${study.id}/review`),
                }),
            }),
        )
    })

    it('sendStudyResultsApprovedEmail calls deliver for researcher', async () => {
        const { study, org } = await insertTestOrgStudyJobUsers()
        const researcher = await getUser(study.researcherId)

        await mailgun.sendStudyResultsApprovedEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: researcher.email,
                subject: expect.stringContaining('Results'),
                template: 'vb - study results approved',
                vars: expect.objectContaining({
                    fullName: researcher.fullName,
                    studyTitle: study.title,
                    submittedBy: researcher.fullName,
                    submittedTo: org.name,
                    studyURL: expect.stringContaining(`/researcher/study/${study.id}/review`),
                }),
            }),
        )
    })

    it('sendStudyResultsRejectedEmail calls deliver for researcher', async () => {
        const { study, org } = await insertTestOrgStudyJobUsers()
        const researcher = await getUser(study.researcherId)

        await mailgun.sendStudyResultsRejectedEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: researcher.email,
                subject: expect.stringContaining('Results'),
                template: 'vb - study results rejected',
                vars: expect.objectContaining({
                    fullName: researcher.fullName,
                    studyTitle: study.title,
                    submittedBy: researcher.fullName,
                    submittedTo: org.name,
                }),
            }),
        )
    })
})
