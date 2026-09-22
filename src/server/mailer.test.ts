import { db } from '@/database'
import { Routes } from '@/lib/routes'
import * as mailgun from '@/server/mailer'
import {
    faker,
    insertTestOrg,
    insertTestOrgStudyJobUsers,
    insertTestStudyJobData,
    insertTestUser,
} from '@/tests/unit.helpers'
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

    it('sendStudyAgreementReadyEmail reaches the researcher, greeted by name', async () => {
        const { study, org: dataPartner } = await insertTestOrgStudyJobUsers()
        const researcher = await getUser(study.researcherId)

        await mailgun.sendStudyAgreementReadyEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: researcher.email,
                subject: 'Acknowledge Study Agreement',
                template: 'vb - sla ready for acknowledgment',
                vars: expect.objectContaining({
                    studyTitle: study.title,
                    studyName: study.title,
                    fullName: researcher.fullName,
                    dataPartner: dataPartner.name,
                }),
            }),
        )
    })

    // One send each, not a Bcc: the template greets by name, which a shared send cannot do.
    it('sendStudyAgreementReadyEmail names each reader in their own send', async () => {
        const { study, user2 } = await insertTestOrgStudyJobUsers()
        await db.updateTable('study').set({ piUserId: user2.id }).where('id', '=', study.id).execute()

        await mailgun.sendStudyAgreementReadyEmail(study.id)

        expect(deliverMock).toHaveBeenCalledTimes(2)
        for (const [message] of deliverMock.mock.calls as [{ bcc?: string; vars: Record<string, unknown> }][]) {
            expect(message.bcc).toBeUndefined()
            expect(message.vars.fullName).toBeTruthy()
        }
    })

    // Any lab member may submit a later version, and only the resubmission note records who did.
    it('sendStudyAgreementReadyEmail includes whoever resubmitted a later version', async () => {
        const { study, user2 } = await insertTestOrgStudyJobUsers()
        await db
            .insertInto('studyProposalComment')
            .values({
                studyId: study.id,
                authorId: user2.id,
                authorRole: 'RESEARCHER',
                entryType: 'RESUBMISSION-NOTE',
                body: JSON.stringify({ text: 'updated the methodology' }),
                version: 2,
            })
            .execute()
        await mailgun.sendStudyAgreementReadyEmail(study.id)

        const recipients = (deliverMock.mock.calls as [{ to: string }][]).map(([message]) => message.to)
        expect(recipients).toContain(user2.email)
    })

    // piName is a plain string on the proposal, so most studies have no second address to reach. The
    // PI is only mailable once piUserId points at an account.
    it('sendStudyAgreementReadyEmail adds the PI once they hold an account, without duplicating them', async () => {
        const { study, user1 } = await insertTestOrgStudyJobUsers()
        await db.updateTable('study').set({ piUserId: user1.id }).where('id', '=', study.id).execute()
        const researcher = await getUser(study.researcherId)
        await mailgun.sendStudyAgreementReadyEmail(study.id)

        const recipients = (deliverMock.mock.calls as [{ to: string }][]).map(([message]) => message.to)
        expect(recipients).toContain(user1.email)
        expect(recipients).toContain(researcher.email)
        expect(new Set(recipients).size).toBe(recipients.length)
    })

    // This email goes to the lab, and the route keys on the lab's slug, not the Data Partner's.
    it('sendStudyAgreementReadyEmail links through the Research Lab, not the Data Partner', async () => {
        const { study, org: dataPartner } = await insertTestOrgStudyJobUsers()
        const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        await db.updateTable('study').set({ submittedByOrgId: researchLab.id }).where('id', '=', study.id).execute()
        await mailgun.sendStudyAgreementReadyEmail(study.id)

        const [[message]] = deliverMock.mock.calls as [[{ vars: Record<string, unknown> }]]
        const studyURL = message.vars.studyURL as string
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

    // The shared fixture seeds an acknowledged agreement, which is exactly what this email skips on.
    const insertStudyAwaitingAgreement = async () => {
        const org = await insertTestOrg()
        const { study } = await insertTestStudyJobData({ org, withStudyAgreement: false })
        return { study, org }
    }

    it('sendStudyAgreementPreparationEmail reaches SafeInsights admins, in Bcc', async () => {
        const admin = await insertSiAdmin()
        const { study, org } = await insertStudyAwaitingAgreement()

        await mailgun.sendStudyAgreementPreparationEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: SI_EMAIL,
                bcc: expect.stringContaining(admin.email || ''),
                subject: 'New Study Agreement required',
                template: 'vb - sla notice',
                vars: expect.objectContaining({
                    studyTitle: study.title,
                    studyName: study.title,
                    researchLab: org.name,
                    dataPartner: org.name,
                    studyURL: expect.stringContaining(Routes.studyReview({ orgSlug: org.slug, studyId: study.id })),
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
        const { study } = await insertStudyAwaitingAgreement()

        await mailgun.sendStudyAgreementPreparationEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(expect.objectContaining({ template: 'vb - sla notice' }))
        expect(deliverMock).not.toHaveBeenCalledWith(
            expect.objectContaining({ bcc: expect.stringContaining(member.email || '') }),
        )
    })

    it('sendStudyAgreementPreparationEmail sends nothing for a test study', async () => {
        await insertSiAdmin()
        const { study } = await insertStudyAwaitingAgreement()
        await db.updateTable('study').set({ isTestStudy: true }).where('id', '=', study.id).execute()

        await mailgun.sendStudyAgreementPreparationEmail(study.id)

        expect(deliverMock).not.toHaveBeenCalled()
    })

    // Nathan's guard on PR #1062: an agreement already under way must not ask for a second one.
    it('sendStudyAgreementPreparationEmail sends nothing once an agreement exists', async () => {
        await insertSiAdmin()
        const { study } = await insertTestOrgStudyJobUsers()

        await mailgun.sendStudyAgreementPreparationEmail(study.id)

        expect(deliverMock).not.toHaveBeenCalled()
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
