import { db } from '@/database'
import { Routes } from '@/lib/routes'
import * as mailgun from '@/server/mailer'
import { audit } from '@/server/events'
import {
    faker,
    insertTestOrg,
    insertTestOrgStudyJobUsers,
    insertTestProposalDecision,
    insertTestStudyJobData,
    insertTestUser,
} from '@/tests/unit.helpers'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { describe, expect, it, Mock, vi } from 'vitest'
import { deliver, SI_AGREEMENTS_EMAIL } from './mailgun'

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

    it('sendStudyProposalEmails greets each Data Partner member by name, linking to the study review', async () => {
        const { study, org, user1 } = await insertTestOrgStudyJobUsers()

        await mailgun.sendStudyProposalEmails(study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: user1.email,
                subject: 'Proposal needs review',
                template: 'vb - new research proposal',
                vars: expect.objectContaining({
                    fullName: user1.fullName,
                    studyTitle: study.title,
                    researchLab: org.name,
                    actionURL: expect.stringContaining(Routes.studyReview({ orgSlug: org.slug, studyId: study.id })),
                }),
            }),
        )
    })

    it('sendStudyProposalEmails sends one address per message, never a Bcc (OTTER-651)', async () => {
        const { study } = await insertTestOrgStudyJobUsers()
        const orgMembers = await db
            .selectFrom('user')
            .innerJoin('orgUser', 'user.id', 'orgUser.userId')
            .select(['user.email'])
            .where('orgUser.orgId', '=', study.orgId)
            .execute()

        await mailgun.sendStudyProposalEmails(study.id)

        const messages = (deliverMock.mock.calls as [{ to: string; bcc?: string }][]).map(([message]) => message)
        expect(messages.map((message) => message.to).sort()).toEqual(orgMembers.map((m) => m.email).sort())
        for (const message of messages) expect(message.bcc).toBeUndefined()
    })

    it('sendStudyProposalEmails dates a revised proposal by its resubmission, not the first submission', async () => {
        const { study, user2 } = await insertTestOrgStudyJobUsers()
        await db
            .updateTable('study')
            .set({ submittedAt: new Date('2026-01-05') })
            .where('id', '=', study.id)
            .execute()
        await db
            .insertInto('studyProposalComment')
            .values({
                studyId: study.id,
                authorId: user2.id,
                authorRole: 'RESEARCHER',
                entryType: 'RESUBMISSION-NOTE',
                body: JSON.stringify({ text: 'revised the methodology' }),
                version: 2,
                createdAt: new Date('2026-03-10T12:00:00'),
            })
            .execute()

        await mailgun.sendStudyProposalEmails(study.id)

        const [[message]] = deliverMock.mock.calls as [[{ vars: Record<string, unknown> }]]
        expect(message.vars.submittedOn).toBe('03/10/2026')
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

    // Any lab member can finalize a draft someone else created; only the CREATED audit row names them.
    it('sendStudyProposalApprovedEmail reaches a co-author who submitted the proposal', async () => {
        const { study, user2: coAuthor } = await insertTestOrgStudyJobUsers()
        await audit({ userId: coAuthor.id, eventType: 'CREATED', recordType: 'STUDY', recordId: study.id })

        await mailgun.sendStudyProposalApprovedEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: coAuthor.email,
                vars: expect.objectContaining({ fullName: coAuthor.fullName }),
            }),
        )
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
        const actionURL = message.vars.actionURL as string
        expect(actionURL).toContain(Routes.studySubmitted({ orgSlug: researchLab.slug, studyId: study.id }))
        expect(actionURL).not.toContain(Routes.studySubmitted({ orgSlug: dataPartner.slug, studyId: study.id }))
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
                to: SI_AGREEMENTS_EMAIL,
                bcc: expect.stringContaining(admin.email || ''),
                subject: 'New Study Agreement required',
                template: 'vb - sla notice',
                vars: expect.objectContaining({
                    studyTitle: study.title,
                    researchLab: org.name,
                    dataPartner: org.name,
                    actionURL: expect.stringContaining(Routes.studyReview({ orgSlug: org.slug, studyId: study.id })),
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

    it('sendStudyCodeSubmittedEmail greets each proposal decider once, linking to the study review', async () => {
        const { study, org, user2: decider } = await insertTestOrgStudyJobUsers()
        await insertTestProposalDecision({ studyId: study.id, authorId: decider.id })
        await insertTestProposalDecision({ studyId: study.id, authorId: decider.id })

        await mailgun.sendStudyCodeSubmittedEmail(study.id)

        // user1, the researcher, is also an org member but never decided on the proposal.
        expect(deliverMock).toHaveBeenCalledTimes(1)
        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: decider.email,
                subject: 'Code needs review',
                template: 'vb - new code submission',
                vars: expect.objectContaining({
                    fullName: decider.fullName,
                    studyTitle: study.title,
                    researchLab: org.name,
                    actionURL: expect.stringContaining(Routes.studyReview({ orgSlug: org.slug, studyId: study.id })),
                }),
            }),
        )
    })

    it.each([
        ['sendDataPartnerCodeErroredEmail', 'Code errored', 'vb - dp - code errored'],
        ['sendDataPartnerOutputsNeedReviewEmail', 'Outputs need review', 'vb - dp - outputs need review'],
    ] as const)(
        '%s reaches whoever decided on the proposal or the code, linking to the review',
        async (send, subject, template) => {
            const { study, org, job, user1: researcher, user2: proposalDecider } = await insertTestOrgStudyJobUsers()
            const { user: codeDecider } = await insertTestUser({ org })
            await insertTestProposalDecision({ studyId: study.id, authorId: proposalDecider.id })
            await db
                .insertInto('studyReviewComment')
                .values({
                    studyId: study.id,
                    studyJobId: job.id,
                    authorId: codeDecider.id,
                    reviewKind: 'CODE',
                    entryType: 'DECISION',
                    decision: 'APPROVE',
                    body: JSON.stringify({ text: 'looks good' }),
                })
                .execute()

            await mailgun[send](study.id)

            const recipients = (deliverMock.mock.calls as [{ to: string }][]).map(([message]) => message.to)
            expect(recipients.sort()).toEqual([proposalDecider.email, codeDecider.email].sort())
            expect(recipients).not.toContain(researcher.email)
            expect(deliverMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: codeDecider.email,
                    subject,
                    template,
                    vars: expect.objectContaining({
                        fullName: codeDecider.fullName,
                        studyTitle: study.title,
                        researchLab: org.name,
                        actionURL: expect.stringContaining(
                            Routes.studyReview({ orgSlug: org.slug, studyId: study.id }),
                        ),
                    }),
                }),
            )
        },
    )

    it('sendStudyCodeSubmittedEmail still reaches a decider who has since left the Data Partner', async () => {
        const { study } = await insertTestOrgStudyJobUsers()
        const elsewhere = await insertTestOrg({ slug: faker.string.alpha(10) })
        const { user: formerMember } = await insertTestUser({ org: elsewhere })
        await insertTestProposalDecision({ studyId: study.id, authorId: formerMember.id })

        await mailgun.sendStudyCodeSubmittedEmail(study.id)

        expect(deliverMock).toHaveBeenCalledWith(expect.objectContaining({ to: formerMember.email }))
    })

    it.each([
        ['sendStudyProposalApprovedEmail', 'Proposal approved', 'vb - research proposal approved'],
        ['sendStudyProposalRejectedEmail', 'Proposal declined', 'vb - research proposal rejected'],
        ['sendStudyProposalNeedsRevisionEmail', 'Proposal needs revision', 'vb - research proposal needs revision'],
        ['sendStudyCodeApprovedEmail', 'Study code approved', 'vb - code approved'],
        ['sendStudyCodeNeedsRevisionEmail', 'Code needs revision', 'vb - code needs revision'],
        ['sendLabCodeErroredEmail', 'Code errored', 'vb - rl - code errored'],
        ['sendLabOutputsNeedReviewEmail', 'Outputs need review', 'vb - rl - outputs need review'],
    ] as const)('%s tells each lab party by name, linking through the lab', async (send, subject, template) => {
        const { study, org: dataPartner, user2: pi } = await insertTestOrgStudyJobUsers()
        const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        await db
            .updateTable('study')
            .set({ submittedByOrgId: researchLab.id, piUserId: pi.id })
            .where('id', '=', study.id)
            .execute()
        const researcher = await getUser(study.researcherId)

        await mailgun[send](study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: researcher.email,
                subject,
                template,
                vars: expect.objectContaining({
                    fullName: researcher.fullName,
                    studyTitle: study.title,
                    researchLab: researchLab.name,
                    dataPartner: dataPartner.name,
                    actionURL: expect.stringContaining(
                        Routes.studyView({ orgSlug: researchLab.slug, studyId: study.id }),
                    ),
                }),
            }),
        )
        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({ to: pi.email, vars: expect.objectContaining({ fullName: pi.fullName }) }),
        )
    })

    it.each([
        'sendStudyCodeApprovedEmail',
        'sendStudyCodeNeedsRevisionEmail',
        'sendLabCodeErroredEmail',
        'sendLabOutputsNeedReviewEmail',
    ] as const)('%s also reaches whoever submitted a version of the code', async (send) => {
        const { study, job } = await insertTestOrgStudyJobUsers()
        const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        await db.updateTable('study').set({ submittedByOrgId: researchLab.id }).where('id', '=', study.id).execute()
        const { user: codeSubmitter } = await insertTestUser({ org: researchLab })
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, userId: codeSubmitter.id, status: 'CODE-SUBMITTED' })
            .execute()

        await mailgun[send](study.id)

        expect(deliverMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: codeSubmitter.email,
                vars: expect.objectContaining({ fullName: codeSubmitter.fullName }),
            }),
        )
    })
})
