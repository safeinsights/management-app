import { describe, expect, it } from 'vitest'
import { db } from '@/database'
import { isActionError } from '@/lib/errors'
import { actionResult, faker, insertTestOrg, mockSessionWithTestData } from '@/tests/unit.helpers'
import { designateTestLabsAction, fetchEligibleTestLabsAction, fetchOrgTestLabsAction } from './test-labs.actions'

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
