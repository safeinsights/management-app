import { describe, expect, it } from 'vitest'
import { db } from '@/database'
import { isActionError } from '@/lib/errors'
import { actionResult, faker, insertTestOrg, mockSessionWithTestData } from '@/tests/unit.helpers'
import {
    designateTestLabsAction,
    fetchEligibleTestLabsAction,
    fetchOrgTestLabsAction,
    undesignateTestLabAction,
} from './test-labs.actions'

const insertLab = () => insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })

const asDataPartnerAdmin = async () => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const session = await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

    return { dataPartner, session }
}

describe('designateTestLabsAction', () => {
    it('records the pair and lists it back', async () => {
        const { dataPartner } = await asDataPartnerAdmin()
        const lab = await insertLab()

        actionResult(await designateTestLabsAction({ orgSlug: dataPartner.slug, researchLabIds: [lab.id] }))

        const designated = actionResult(await fetchOrgTestLabsAction({ orgSlug: dataPartner.slug }))
        expect(designated.map((row) => row.researchLabId)).toEqual([lab.id])
    })

    it('adds several labs at once and drops one already designated', async () => {
        const { dataPartner } = await asDataPartnerAdmin()
        const [first, second] = [await insertLab(), await insertLab()]

        actionResult(await designateTestLabsAction({ orgSlug: dataPartner.slug, researchLabIds: [first.id] }))
        actionResult(
            await designateTestLabsAction({ orgSlug: dataPartner.slug, researchLabIds: [first.id, second.id] }),
        )

        const rows = await db
            .selectFrom('orgTestLab')
            .select('researchLabId')
            .where('dataPartnerId', '=', dataPartner.id)
            .execute()

        expect(rows).toHaveLength(2)
    })

    it('refuses an org that is not a research lab', async () => {
        const { dataPartner } = await asDataPartnerAdmin()
        const otherEnclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })

        const result = await designateTestLabsAction({
            orgSlug: dataPartner.slug,
            researchLabIds: [otherEnclave.id],
        })

        expect(isActionError(result)).toBe(true)
    })

    it('refuses a member who is not an org admin', async () => {
        const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave' })
        const lab = await insertLab()

        const result = await designateTestLabsAction({ orgSlug: dataPartner.slug, researchLabIds: [lab.id] })

        expect(isActionError(result)).toBe(true)
    })

    it('refuses an admin of a different org', async () => {
        const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        await mockSessionWithTestData({ orgSlug: faker.string.alpha(10), orgType: 'enclave', isAdmin: true })
        const lab = await insertLab()

        const result = await designateTestLabsAction({ orgSlug: dataPartner.slug, researchLabIds: [lab.id] })

        expect(isActionError(result)).toBe(true)
    })

    it('refuses a research lab designating test labs of its own', async () => {
        const lab = await insertLab()
        await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab', isAdmin: true })
        const other = await insertLab()

        const result = await designateTestLabsAction({ orgSlug: lab.slug, researchLabIds: [other.id] })

        expect(isActionError(result)).toBe(true)
    })
})

describe('fetchEligibleTestLabsAction', () => {
    it('offers every lab and drops the ones already designated', async () => {
        const { dataPartner } = await asDataPartnerAdmin()
        const [designated, available] = [await insertLab(), await insertLab()]
        actionResult(await designateTestLabsAction({ orgSlug: dataPartner.slug, researchLabIds: [designated.id] }))

        const eligible = actionResult(await fetchEligibleTestLabsAction({ orgSlug: dataPartner.slug }))
        const ids = eligible.map((lab) => lab.id)

        expect(ids).toContain(available.id)
        expect(ids).not.toContain(designated.id)
    })

    it('leaves enclaves out of the picker', async () => {
        const { dataPartner } = await asDataPartnerAdmin()

        const eligible = actionResult(await fetchEligibleTestLabsAction({ orgSlug: dataPartner.slug }))

        expect(eligible.map((lab) => lab.id)).not.toContain(dataPartner.id)
    })
})

const asSiAdmin = async () => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true, isSiAdmin: true })

    return { dataPartner }
}

const designatedRowId = async (dataPartnerId: string, researchLabId: string) => {
    const row = await db
        .selectFrom('orgTestLab')
        .select('id')
        .where('dataPartnerId', '=', dataPartnerId)
        .where('researchLabId', '=', researchLabId)
        .executeTakeFirstOrThrow()

    return row.id
}

const rowExists = async (testLabId: string) =>
    Boolean(await db.selectFrom('orgTestLab').select('id').where('id', '=', testLabId).executeTakeFirst())

describe('undesignateTestLabAction', () => {
    it('drops the lab, which becomes eligible again and can be designated once more', async () => {
        const { dataPartner } = await asSiAdmin()
        const lab = await insertLab()
        actionResult(await designateTestLabsAction({ orgSlug: dataPartner.slug, researchLabIds: [lab.id] }))
        const testLabId = await designatedRowId(dataPartner.id, lab.id)

        actionResult(await undesignateTestLabAction({ orgSlug: dataPartner.slug, testLabId }))

        expect(actionResult(await fetchOrgTestLabsAction({ orgSlug: dataPartner.slug }))).toEqual([])
        const eligible = actionResult(await fetchEligibleTestLabsAction({ orgSlug: dataPartner.slug }))
        expect(eligible.map((row) => row.id)).toContain(lab.id)

        actionResult(await designateTestLabsAction({ orgSlug: dataPartner.slug, researchLabIds: [lab.id] }))
        const designated = actionResult(await fetchOrgTestLabsAction({ orgSlug: dataPartner.slug }))
        expect(designated.map((row) => row.researchLabId)).toEqual([lab.id])
    })

    it('refuses a data partner admin who is not an SI admin, and keeps the row', async () => {
        const { dataPartner } = await asDataPartnerAdmin()
        const lab = await insertLab()
        actionResult(await designateTestLabsAction({ orgSlug: dataPartner.slug, researchLabIds: [lab.id] }))
        const testLabId = await designatedRowId(dataPartner.id, lab.id)

        const result = await undesignateTestLabAction({ orgSlug: dataPartner.slug, testLabId })

        expect(isActionError(result)).toBe(true)
        expect(await rowExists(testLabId)).toBe(true)
    })

    it("refuses another data partner's row, even for an SI admin, and keeps it", async () => {
        const { dataPartner: other } = await asDataPartnerAdmin()
        const lab = await insertLab()
        actionResult(await designateTestLabsAction({ orgSlug: other.slug, researchLabIds: [lab.id] }))
        const testLabId = await designatedRowId(other.id, lab.id)
        const { dataPartner } = await asSiAdmin()

        const result = await undesignateTestLabAction({ orgSlug: dataPartner.slug, testLabId })

        expect(isActionError(result)).toBe(true)
        expect(await rowExists(testLabId)).toBe(true)
    })

    it('refuses a research lab as the acting org', async () => {
        const lab = await insertLab()
        await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab', isAdmin: true, isSiAdmin: true })

        const result = await undesignateTestLabAction({ orgSlug: lab.slug, testLabId: faker.string.uuid() })

        expect(isActionError(result)).toBe(true)
    })

    it('reports an unknown row as not found', async () => {
        const { dataPartner } = await asSiAdmin()

        const result = await undesignateTestLabAction({ orgSlug: dataPartner.slug, testLabId: faker.string.uuid() })

        expect(result).toMatchObject({ error: expect.objectContaining({ testLab: 'was not found' }) })
    })
})
