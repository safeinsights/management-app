import { db } from '@/database'
import { Routes } from '@/lib/routes'
import * as mailgun from '@/server/mailer'
import { faker, insertTestOrg, insertTestOrgStudyJobUsers, insertTestUser } from '@/tests/unit.helpers'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { describe, expect, it, Mock, vi } from 'vitest'
import { deliver, SI_EMAIL } from './mailgun'

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

    it('sendStudyProposalEmails sends all org members in Bcc, not To (OTTER-651)', async () => {
        const { study, org, user1 } = await insertTestOrgStudyJobUsers()

        const researcher = await getUser(study.researcherId)

        await mailgun.sendStudyProposalEmails(study.id)

        expect(deliver).toHaveBeenCalledWith(
            expect.objectContaining({
                to: SI_EMAIL,
                bcc: expect.stringContaining(user1.email || ''),
                subject: expect.stringContaining('New study proposal'),
                template: 'vb - new research proposal',
                vars: expect.objectContaining({
                    submittedTo: org.name,
                    studyTitle: study.title,
                    submittedBy: researcher.fullName,
                    dashboardURL: expect.stringContaining(`/${org.slug}/dashboard`),
                }),
            }),
        )
    })

    // Both Study Agreement emails are held until Iris's Mailgun templates exist, so they return the
    // message they would send instead of delivering it. Assert on `deliver` again once they send.
    it('sendStudyAgreementReadyEmail reaches the researcher, in Bcc', async () => {
        const { study } = await insertTestOrgStudyJobUsers()
        const researcher = await getUser(study.researcherId)

        const message = await mailgun.sendStudyAgreementReadyEmail(study.id)

        expect(message).toEqual(
            expect.objectContaining({
                to: SI_EMAIL,
                bcc: expect.stringContaining(researcher.email || ''),
                subject: expect.stringContaining('Study Agreement'),
                vars: expect.objectContaining({ studyTitle: study.title }),
            }),
        )
    })

    it('sendStudyAgreementReadyEmail sends nothing while its template is missing', async () => {
        const { study } = await insertTestOrgStudyJobUsers()
        const callsBefore = deliverMock.mock.calls.length

        await mailgun.sendStudyAgreementReadyEmail(study.id)

        expect(deliverMock.mock.calls).toHaveLength(callsBefore)
    })

    // piName is a plain string on the proposal, so most studies have no second address to reach. The
    // PI is only mailable once piUserId points at an account.
    it('sendStudyAgreementReadyEmail adds the PI once they hold an account, without duplicating them', async () => {
        const { study, user1 } = await insertTestOrgStudyJobUsers()
        await db.updateTable('study').set({ piUserId: user1.id }).where('id', '=', study.id).execute()
        const researcher = await getUser(study.researcherId)

        const message = await mailgun.sendStudyAgreementReadyEmail(study.id)

        const recipients = message!.bcc!.split(', ')
        expect(recipients).toContain(user1.email)
        expect(recipients).toContain(researcher.email)
        expect(new Set(recipients).size).toBe(recipients.length)
    })

    // This email goes to the lab, and the route keys on the lab's slug, not the Data Partner's.
    it('sendStudyAgreementReadyEmail links through the Research Lab, not the Data Partner', async () => {
        const { study, org: dataPartner } = await insertTestOrgStudyJobUsers()
        const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        await db.updateTable('study').set({ submittedByOrgId: researchLab.id }).where('id', '=', study.id).execute()

        const message = await mailgun.sendStudyAgreementReadyEmail(study.id)

        const studyURL = message!.vars.studyURL as string
        expect(studyURL).toContain(Routes.studySubmitted({ orgSlug: researchLab.slug, studyId: study.id }))
        expect(studyURL).not.toContain(Routes.studySubmitted({ orgSlug: dataPartner.slug, studyId: study.id }))
    })

    const insertSiAdmin = async () => {
        const siOrg = await insertTestOrg({ slug: CLERK_ADMIN_ORG_SLUG, type: 'enclave' })
        const { user } = await insertTestUser({
            org: { id: siOrg.id, slug: siOrg.slug, type: 'enclave' },
            isAdmin: true,
        })
        return user
    }

    it('sendStudyAgreementPreparationEmail reaches SafeInsights admins, in Bcc', async () => {
        const admin = await insertSiAdmin()
        const { study, org } = await insertTestOrgStudyJobUsers()

        const message = await mailgun.sendStudyAgreementPreparationEmail(study.id)

        expect(message).toEqual(
            expect.objectContaining({
                to: SI_EMAIL,
                bcc: expect.stringContaining(admin.email || ''),
                subject: expect.stringContaining('Study Agreement'),
                vars: expect.objectContaining({
                    studyTitle: study.title,
                    researchLab: org.name,
                    legalURL: expect.stringContaining(Routes.adminSafeinsightsLegal),
                }),
            }),
        )
    })

    // A member of the SI org who is not an admin cannot upload an agreement, so asking them is noise.
    it('sendStudyAgreementPreparationEmail leaves out non-admin members of the SafeInsights org', async () => {
        await insertSiAdmin()
        const siOrg = await insertTestOrg({ slug: CLERK_ADMIN_ORG_SLUG, type: 'enclave' })
        const { user: member } = await insertTestUser({
            org: { id: siOrg.id, slug: siOrg.slug, type: 'enclave' },
        })
        const { study } = await insertTestOrgStudyJobUsers()

        const message = await mailgun.sendStudyAgreementPreparationEmail(study.id)

        expect(message!.bcc).not.toContain(member.email)
    })

    it('sendStudyAgreementPreparationEmail builds nothing for a test study', async () => {
        await insertSiAdmin()
        const { study } = await insertTestOrgStudyJobUsers()
        await db.updateTable('study').set({ isTestStudy: true }).where('id', '=', study.id).execute()

        expect(await mailgun.sendStudyAgreementPreparationEmail(study.id)).toBeUndefined()
    })

    it('sendStudyAgreementPreparationEmail sends nothing while its template is missing', async () => {
        await insertSiAdmin()
        const { study } = await insertTestOrgStudyJobUsers()
        const callsBefore = deliverMock.mock.calls.length

        await mailgun.sendStudyAgreementPreparationEmail(study.id)

        expect(deliverMock.mock.calls).toHaveLength(callsBefore)
    })

    it('sendStudyCodeSubmittedEmail sends all org members in Bcc, not To (OTTER-651)', async () => {
        const { study, user1 } = await insertTestOrgStudyJobUsers()
        const researcher = await getUser(study.researcherId)

        await mailgun.sendStudyCodeSubmittedEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: SI_EMAIL,
                bcc: expect.stringContaining(user1.email || ''),
                subject: 'Study code submitted for review',
                template: 'vb - new code submission',
                vars: expect.objectContaining({
                    studyTitle: study.title,
                    submittedBy: researcher.fullName,
                    dashboardURL: expect.stringContaining('/dashboard?audience=reviewer'),
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
                    dashboardURL: expect.stringContaining('/dashboard?audience=researcher'),
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
                    dashboardURL: expect.stringContaining('/dashboard?audience=researcher'),
                }),
            }),
        )
    })

    it('mass emails never put recipient addresses in To (OTTER-651 regression)', async () => {
        const { study } = await insertTestOrgStudyJobUsers()

        const orgMembers = await db
            .selectFrom('user')
            .innerJoin('orgUser', 'user.id', 'orgUser.userId')
            .distinctOn('user.id')
            .select(['user.email'])
            .where('orgUser.orgId', '=', study.orgId)
            .execute()
        const allEmails = orgMembers.map((m) => m.email).filter(Boolean)

        expect(allEmails.length).toBeGreaterThan(1)

        await mailgun.sendStudyProposalEmails(study.id)
        const proposalCall = deliverMock.mock.calls.at(-1)![0] as { to: string; bcc?: string }
        expect(proposalCall.to).toBe(SI_EMAIL)
        for (const email of allEmails) {
            expect(proposalCall.to).not.toContain(email)
            expect(proposalCall.bcc).toContain(email)
        }

        await mailgun.sendStudyCodeSubmittedEmail(study.id)
        const codeCall = deliverMock.mock.calls.at(-1)![0] as { to: string; bcc?: string }
        expect(codeCall.to).toBe(SI_EMAIL)
        for (const email of allEmails) {
            expect(codeCall.to).not.toContain(email)
            expect(codeCall.bcc).toContain(email)
        }
    })

    it('sendResultsReadyForReviewEmail calls deliver for reviewer', async () => {
        const { study, user1: reviewer } = await insertTestOrgStudyJobUsers()
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
                    dashboardURL: expect.stringContaining('/dashboard?audience=reviewer'),
                }),
            }),
        )
    })

    it('sendStudyCodeApprovedEmail calls deliver for researcher', async () => {
        const { study, org } = await insertTestOrgStudyJobUsers()
        const researcher = await getUser(study.researcherId)

        await mailgun.sendStudyCodeApprovedEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: researcher.email,
                subject: expect.stringContaining('Code Approved'),
                template: 'vb - code approved',
                vars: expect.objectContaining({
                    fullName: researcher.fullName,
                    studyTitle: study.title,
                    submittedBy: researcher.fullName,
                    submittedTo: org.name,
                    dashboardURL: expect.stringContaining('/dashboard?audience=researcher'),
                }),
            }),
        )
    })

    it('sendStudyCodeRejectedEmail calls deliver for researcher', async () => {
        const { study, org } = await insertTestOrgStudyJobUsers()
        const researcher = await getUser(study.researcherId)

        await mailgun.sendStudyCodeRejectedEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: researcher.email,
                subject: expect.stringContaining('Code Rejected'),
                template: 'vb - code rejected',
                vars: expect.objectContaining({
                    fullName: researcher.fullName,
                    studyTitle: study.title,
                    submittedBy: researcher.fullName,
                    submittedTo: org.name,
                    dashboardURL: expect.stringContaining('/dashboard?audience=researcher'),
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
                    dashboardURL: expect.stringContaining('/dashboard?audience=researcher'),
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
                    dashboardURL: expect.stringContaining('/dashboard?audience=researcher'),
                }),
            }),
        )
    })
})
