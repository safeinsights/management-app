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
    insertTestStudyOnly,
    insertTestUser,
    mockSessionWithTestData,
    resetLegalDocuments,
} from '@/tests/unit.helpers'
import { requireStudyAgreementAcknowledged } from '@/server/study-agreement'
import { acknowledgeLegalDocumentAction, fetchStudyAgreementStatusAction } from './legal-document.actions'
import { submitCodeReviewDecisionAction } from './study.actions'
import { resubmitStudyCodeAction, submitStudyCodeAction } from './study-request'
import { submitOutputsDecisionAction } from './study-job.actions'

beforeEach(resetLegalDocuments)

// Separate orgs for the two sides, so a swapped join in the audience check cannot pass.
const insertStudyWithDistinctOrgs = async ({ status = 'APPROVED' as StudyStatus, isTestStudy = false } = {}) => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { user: researcher } = await insertTestUser({
        org: { id: researchLab.id, slug: researchLab.slug, type: 'lab' },
    })

    // These files publish and acknowledge their own agreements, so the fixture writes none.
    const { study } = await insertTestStudyOnly({
        org: dataPartner,
        submittedByOrg: researchLab,
        researcherId: researcher.id,
        status,
        isTestStudy,
        withStudyAgreement: false,
    })

    return { study, dataPartner, researchLab }
}

describe('fetchStudyAgreementStatusAction', () => {
    // The notice prints both names, so they travel with the state rather than being fetched again.
    it('reports none when no agreement has been published', async () => {
        const { study, researchLab, dataPartner } = await insertStudyWithDistinctOrgs()
        await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        expect(actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toEqual({
            state: 'none',
            researchLabName: researchLab.name,
            dataPartnerName: dataPartner.name,
        })
    })

    it('reports exempt for a test study, so the notice does not block a lab that owes nothing', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs({ isTestStudy: true })
        await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        expect(actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toEqual({ state: 'exempt' })
    })

    it('reports none for a draft, so nobody is blocked by an abandoned upload', async () => {
        const { study, researchLab, dataPartner } = await insertStudyWithDistinctOrgs()
        await insertTestStudyAgreement({ studyId: study.id, published: false })
        await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        expect(actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toEqual({
            state: 'none',
            researchLabName: researchLab.name,
            dataPartnerName: dataPartner.name,
        })
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

    // SI admins hold ('manage', 'all'), so the ability check alone would hand them the modal, and an
    // acknowledgement row from the counterparty would land in the signatory audit.
    it('reports notAParty for an SI admin, who is not a party to the agreement', async () => {
        const { study } = await insertStudyWithDistinctOrgs()
        await insertTestStudyAgreement({ studyId: study.id })
        await mockSessionWithTestData({ isSiAdmin: true })

        expect(actionResult(await fetchStudyAgreementStatusAction({ studyId: study.id }))).toEqual({
            state: 'notAParty',
        })
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
    it('refuses a party when no agreement has been published', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs()
        const { user } = await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        await expect(requireStudyAgreementAcknowledged(db, { studyId: study.id, userId: user.id })).rejects.toThrow()
    })

    it('allows a test study with no agreement', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs({ isTestStudy: true })
        const { user } = await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        await expect(
            requireStudyAgreementAcknowledged(db, { studyId: study.id, userId: user.id }),
        ).resolves.toBeUndefined()
    })

    it('refuses a test study whose agreement is published and unacknowledged', async () => {
        const { study, researchLab } = await insertStudyWithDistinctOrgs({ isTestStudy: true })
        await insertTestStudyAgreement({ studyId: study.id })
        const { user } = await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })

        await expect(requireStudyAgreementAcknowledged(db, { studyId: study.id, userId: user.id })).rejects.toThrow()
    })

    it('allows an SI admin when no agreement has been published, since they sign nothing', async () => {
        const { study } = await insertStudyWithDistinctOrgs()
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })

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
            withStudyAgreement: false,
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

// One refusal per remaining gated act. The states are covered above, so these only have to prove
// the middleware is still on the chain: delete a line and one of them goes green-to-red.
describe('every act the gate names runs the middleware', () => {
    // The code actions refuse in the middleware, before anything reads a job, so only the outputs
    // decision pays for one.
    const arrangeStudy = async (orgType: 'lab' | 'enclave') => {
        const { user, org } = await mockSessionWithTestData({ orgType })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id, withStudyAgreement: false })
        await insertTestStudyAgreement({ studyId: study.id })
        return { study, org }
    }

    const arrangeJob = async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
            withStudyAgreement: false,
        })
        await insertTestStudyAgreement({ studyId: study.id })
        return { job, org }
    }

    it('refuses submitStudyCodeAction', async () => {
        const { study } = await arrangeStudy('lab')

        const result = await submitStudyCodeAction({
            studyId: study.id,
            mainFileName: 'main.R',
            fileNames: ['main.R'],
        })

        expect(() => actionResult(result)).toThrow(/must be acknowledged/)
    })

    // The refusal reaches the user verbatim, so it has to read as a sentence and not as a field key.
    it('refuses in words the user can read', async () => {
        const { study } = await arrangeStudy('lab')

        const result = await submitStudyCodeAction({
            studyId: study.id,
            mainFileName: 'main.R',
            fileNames: ['main.R'],
        })

        expect(() => actionResult(result)).toThrow(
            'Study Agreement must be acknowledged before you can continue with this study',
        )
    })

    it('refuses resubmitStudyCodeAction', async () => {
        const { study } = await arrangeStudy('lab')

        const result = await resubmitStudyCodeAction({
            studyId: study.id,
            mainFileName: 'main.R',
            fileNames: ['main.R'],
            resubmissionNote: buildFeedback(10),
        })

        expect(() => actionResult(result)).toThrow(/must be acknowledged/)
    })

    it('refuses submitOutputsDecisionAction', async () => {
        const { job, org } = await arrangeJob()

        const result = await submitOutputsDecisionAction({
            orgSlug: org.slug,
            studyJobId: job.id,
            decision: 'share-feedback-only',
            feedback: buildFeedback(60),
            sharedFiles: [],
        })

        expect(() => actionResult(result)).toThrow(/must be acknowledged/)
    })
})
