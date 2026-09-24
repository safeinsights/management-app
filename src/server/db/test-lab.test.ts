import { describe, expect, it } from 'vitest'
import { db } from '@/database'
import { actionResult, faker, insertTestOrg, mockSessionWithTestData } from '@/tests/unit.helpers'
import {
    finalizeStudySubmissionAction,
    onSaveDraftStudyAction,
    onSubmitDraftStudyAction,
} from '@/server/actions/study-request'
import { designateTestLabs } from './test-lab'

const insertParties = async () => {
    const enclave = await insertTestOrg({ type: 'enclave', slug: faker.string.alpha(10) })
    const lab = await insertTestOrg({ type: 'lab', slug: `${enclave.slug}-lab` })

    return { enclave, lab }
}

const createDraft = async (enclaveSlug: string, labSlug: string) => {
    await mockSessionWithTestData({ orgSlug: labSlug, orgType: 'lab' })

    const { studyId } = actionResult(
        await onSaveDraftStudyAction({
            orgSlug: enclaveSlug,
            studyInfo: { title: 'Stamped at creation', piName: 'PI', language: 'R', datasets: ['test-dataset'] },
            submittingOrgSlug: labSlug,
        }),
    )

    const study = await db.selectFrom('study').select('isTestStudy').where('id', '=', studyId).executeTakeFirstOrThrow()

    return { studyId, ...study }
}

describe('stamping is_test_study at study creation', () => {
    it('stamps a study submitted by a designated test lab', async () => {
        const { enclave, lab } = await insertParties()
        const { user } = await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave', isAdmin: true })
        await designateTestLabs(db, {
            dataPartnerId: enclave.id,
            researchLabIds: [lab.id],
            createdByUserId: user.id,
        })

        expect((await createDraft(enclave.slug, lab.slug)).isTestStudy).toBe(true)
    })

    it('leaves an undesignated lab alone', async () => {
        const { enclave, lab } = await insertParties()

        expect((await createDraft(enclave.slug, lab.slug)).isTestStudy).toBe(false)
    })

    // The designation marks one relationship, so the same lab still owes agreements elsewhere.
    it('does not stamp the same lab working with a different data partner', async () => {
        const { enclave, lab } = await insertParties()
        const other = await insertTestOrg({ type: 'enclave', slug: faker.string.alpha(10) })
        const { user } = await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave', isAdmin: true })
        await designateTestLabs(db, {
            dataPartnerId: enclave.id,
            researchLabIds: [lab.id],
            createdByUserId: user.id,
        })

        expect((await createDraft(other.slug, lab.slug)).isTestStudy).toBe(false)
    })

    // A test study is exempt from the agreement, not from review: the Data Partner still approves
    // the proposal, which is the flow the test lab exists to exercise.
    it('still sends a test study through proposal review', async () => {
        const { enclave, lab } = await insertParties()
        const { user } = await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave', isAdmin: true })
        await designateTestLabs(db, {
            dataPartnerId: enclave.id,
            researchLabIds: [lab.id],
            createdByUserId: user.id,
        })

        const { studyId, isTestStudy } = await createDraft(enclave.slug, lab.slug)
        expect(isTestStudy).toBe(true)

        actionResult(
            await onSubmitDraftStudyAction({ studyId, mainCodeFileName: 'main.R', codeFileNames: ['helpers.R'] }),
        )
        actionResult(await finalizeStudySubmissionAction({ studyId }))

        const study = await db.selectFrom('study').select('status').where('id', '=', studyId).executeTakeFirstOrThrow()

        expect(study.status).toEqual('PENDING-REVIEW')
    })

    // A designation applies to future studies only.
    it('leaves a study created before the designation unstamped', async () => {
        const { enclave, lab } = await insertParties()
        const before = await createDraft(enclave.slug, lab.slug)

        const { user } = await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave', isAdmin: true })
        await designateTestLabs(db, {
            dataPartnerId: enclave.id,
            researchLabIds: [lab.id],
            createdByUserId: user.id,
        })

        expect(before.isTestStudy).toBe(false)
        expect((await createDraft(enclave.slug, lab.slug)).isTestStudy).toBe(true)
    })
})
