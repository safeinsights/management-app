import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import router from 'next-router-mock'
import { db } from '@/database'
import { globalAcknowledgementUrl } from '@/lib/global-acknowledgement-redirect'
import { Routes } from '@/lib/routes'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import {
    createTestQueryClient,
    faker,
    insertTestLegalDocument,
    mockPathname,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
    userEvent,
} from '@/tests/unit.helpers'
import { RequireLegalAcknowledgement } from './require-acknowledgement'

// A ropa is a pdf, whose body is a signed link; only the AWS boundary is stubbed.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
    }
})

// The gate answers for every published tos/pn, so a seeded database would leave a second
// document outstanding behind the one under test. Off /legal, which the gate leaves uncovered.
beforeEach(async () => {
    await resetLegalDocuments()
    mockPathname(Routes.dashboard)
})

const ropaGate = () => screen.findByRole('dialog', { name: /Research Organization Participation Agreement/ })

const acknowledge = (userId: string, legalDocumentVersionId: string) =>
    db.insertInto('legalDocumentAcknowledgement').values({ userId, legalDocumentVersionId }).execute()

const acknowledgementsFor = (userId: string) =>
    db
        .selectFrom('legalDocumentAcknowledgement')
        .select('legalDocumentVersionId')
        .where('userId', '=', userId)
        .execute()

const userOwingRopa = async () => {
    const session = await mockSessionWithTestData({ orgType: 'lab' })
    const ropa = await insertTestLegalDocument({ type: 'ROPA', orgId: session.org.id, publishedBy: session.user.id })
    return { ...session, ropa }
}

describe('RequireLegalAcknowledgement', () => {
    it('stays out of the way when nothing is outstanding', async () => {
        await mockSessionWithTestData()

        renderWithProviders(<RequireLegalAcknowledgement />)

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(router.asPath).toBe(Routes.dashboard)
    })

    // The layout catches this on a full load; client navigation skips it.
    it('sends a user owing the Terms of Service to the acknowledgement step, keeping their place', async () => {
        const { user } = await mockSessionWithTestData()
        await insertTestLegalDocument({ type: 'TOS', publishedBy: user.id })
        const studiesPage = `${Routes.researcherStudies}?page=2`
        mockPathname(studiesPage)

        renderWithProviders(<RequireLegalAcknowledgement />)

        await waitFor(() => expect(router.asPath).toBe(globalAcknowledgementUrl(studiesPage)))
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    // The step only marks this query stale, so the app returns holding the pre-ack answer.
    it('does not send a user back to the step on a cached answer from before they acknowledged', async () => {
        await mockSessionWithTestData()
        const queryClient = createTestQueryClient()
        const key = legalDocumentQueryKeys.nextPendingAcknowledgement()
        queryClient.setQueryDefaults(key, { refetchOnMount: true })
        queryClient.setQueryData(key, [{ type: 'TOS', versionId: faker.string.uuid(), isUpdate: true }])
        await queryClient.invalidateQueries({ queryKey: key })

        renderWithProviders(<RequireLegalAcknowledgement />, { queryClient })

        await waitFor(() => expect(queryClient.getQueryData(key)).toEqual([]))
        expect(router.asPath).toBe(Routes.dashboard)
    })

    it('asks about a ropa in a modal, with Sign out, once the Terms of Service is acknowledged', async () => {
        const { user, ropa } = await userOwingRopa()
        const tos = await insertTestLegalDocument({ type: 'TOS', publishedBy: user.id })
        await acknowledge(user.id, tos.id)

        renderWithProviders(<RequireLegalAcknowledgement />)

        expect(await ropaGate()).toBeDefined()
        expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined()

        await userEvent.click(screen.getByRole('checkbox'))
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(async () =>
            expect((await acknowledgementsFor(user.id)).map((ack) => ack.legalDocumentVersionId)).toContain(ropa.id),
        )
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(router.asPath).toBe(Routes.dashboard)
    })
})
