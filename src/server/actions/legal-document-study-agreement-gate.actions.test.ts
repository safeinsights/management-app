import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database'
import type { StudyStatus } from '@/database/types'
import { isActionError } from '@/lib/errors'
import {
    actionResult,
    buildFeedback,
    faker,
    insertTestOrg,
    insertTestStudyAgreement,
    insertTestStudyJobData,
    insertTestUser,
    mockSessionWithTestData,
    resetLegalDocuments,
} from '@/tests/unit.helpers'
import { requireStudyAgreementAcknowledged } from '@/server/study-agreement'
import { acknowledgeLegalDocumentAction, fetchStudyAgreementStatusAction } from './legal-document.actions'
import { submitCodeReviewDecisionAction } from './study.actions'

beforeEach(resetLegalDocuments)

// Separate orgs for the two sides, so a swapped join in the audience check cannot pass.
const insertStudyWithDistinctOrgs = async ({ status = 'APPROVED' as StudyStatus } = {}) => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { user: researcher } = await insertTestUser({
        org: { id: researchLab.id, slug: researchLab.slug, type: 'lab' },
    })

    const study = await db
        .insertInto('study')
        .values({
            orgId: dataPartner.id,
            submittedByOrgId: researchLab.id,
            containerLocation: 'test-container',
            title: 'A study',
            researcherId: researcher.id,
            piName: 'test',
            status,
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: 'R',
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    return { study, dataPartner, researchLab }
}

describe('fetchStudyAgreementStatusAction', () => {
    it('reports none when no agreement has been published', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs()
        await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        expect(actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toEqual({ state: 'none' })
    })

    it('reports none for a draft, so nobody is blocked by an abandoned upload', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs()
        await insertTestStudyAgreement({ studyId: study.id, published: false })
        await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        expect(actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toEqual({ state: 'none' })
    })

    // The version id, not a signed URL: the modal links at /dl/legal, which presigns on request.
    it('reports pending for a Research Lab member', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs()
        const version = await insertTestStudyAgreement({ studyId: study.id })
        await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        expect(actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toEqual({
            state: 'pending',
            versionId: version.id,
        })
    })

    it('reports pending for a Data Partner member too', async () => {
        const { study, dataPartner } = await insertStudyWithDistinctOrgs()
        const version = await insertTestStudyAgreement({ studyId: study.id })
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave' })

        const status = actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))
        expect(status).toMatchObject({ state: 'pending', versionId: version.id })
    })

    it('reports acknowledged once the user has acknowledged it', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs()
        const version = await insertTestStudyAgreement({ studyId: study.id })
        await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))

        expect(actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toEqual({
            state: 'acknowledged',
        })
    })

    it('asks again when a new version is published over an acknowledged one', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs()
        const first = await insertTestStudyAgreement({ studyId: study.id, versionNumber: 1 })
        await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })
        actionResult(await acknowledgeLegalDocumentAction({ versionId: first.id }))

        const second = await insertTestStudyAgreement({ studyId: study.id, versionNumber: 2 })

        expect(actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toMatchObject({
            state: 'pending',
            versionId: second.id,
        })
    })

    // SI admins hold ('manage', 'all'), so the ability check alone would hand them the modal — and an
    // acknowledgement row from the counterparty would land in SHRMP-274's audit.
    it('reports none for an SI admin, who is not a party to the agreement', async () => {
        const { study } = await insertStudyWithDistinctOrgs()
        await insertTestStudyAgreement({ studyId: study.id })
        await mockSessionWithTestData({ isSiAdmin: true })

        expect(actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toEqual({ state: 'none' })
    })

    // Denied rather than 'none', so an outsider does not learn whether the study has an agreement.
    it('denies a member of neither org', async () => {
        const { study } = await insertStudyWithDistinctOrgs()
        await insertTestStudyAgreement({ studyId: study.id })
        await mockSessionWithTestData({ orgType: 'lab' })

        expect(isActionError(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toBe(true)
    })
})

describe('requireStudyAgreementAcknowledged', () => {
    it('allows a study with no published agreement, so approval is not gated on SI admin paperwork', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs()
        const { user } = await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        await expect(
            requireStudyAgreementAcknowledged(db, { studyId: study.id, userId: user.id }),
        ).resolves.toBeUndefined()
    })

    it('refuses a party who has not acknowledged', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs()
        await insertTestStudyAgreement({ studyId: study.id })
        const { user } = await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        await expect(requireStudyAgreementAcknowledged(db, { studyId: study.id, userId: user.id })).rejects.toThrow()
    })

    it('allows a party who has acknowledged', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs()
        const version = await insertTestStudyAgreement({ studyId: study.id })
        const { user } = await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })
        actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))

        await expect(
            requireStudyAgreementAcknowledged(db, { studyId: study.id, userId: user.id }),
        ).resolves.toBeUndefined()
    })

    it('allows an SI admin, who owes nothing', async () => {
        const { study } = await insertStudyWithDistinctOrgs()
        await insertTestStudyAgreement({ studyId: study.id })
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })

        await expect(
            requireStudyAgreementAcknowledged(db, { studyId: study.id, userId: user.id }),
        ).resolves.toBeUndefined()
    })
})

describe('submitCodeReviewDecisionAction with an unacknowledged agreement', () => {
    const validCriteria = {
        proposalAlignment: 'yes',
        agreementCompliance: 'yes',
        securityChecks: 'yes',
        privacyProtection: 'yes',
    } as const

    const arrangeCodeReview = async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db.updateTable('study').set({ approvedAt: new Date() }).where('id', '=', study.id).execute()
        return { user, org, study }
    }

    const decide = (studyId: string, orgSlug: string) =>
        submitCodeReviewDecisionAction({
            studyId,
            orgSlug,
            decision: 'approve',
            feedback: buildFeedback(60),
            criteria: validCriteria,
        })

    it('refuses the decision, so the client-side modal is not the only thing stopping it', async () => {
        const { org, study } = await arrangeCodeReview()
        await insertTestStudyAgreement({ studyId: study.id })

        const result = await decide(study.id, org.slug)
        expect(() => actionResult(result)).toThrow()
    })

    it('goes through once the agreement is acknowledged', async () => {
        const { org, study } = await arrangeCodeReview()
        const version = await insertTestStudyAgreement({ studyId: study.id })
        actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))

        const result = await decide(study.id, org.slug)
        expect(() => actionResult(result)).not.toThrow()
    })
})
