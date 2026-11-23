import { db } from '@/database'
import { Routes } from '@/lib/routes'
import {
    beforeEach,
    describe,
    expect,
    faker,
    insertTestLegalDocument,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import router from 'next-router-mock'
import { redirect } from 'next/navigation'
import AgreementsPage from './page'

// A seeded database would leave its own tos/pn owed alongside the ones under test.
beforeEach(async () => {
    await resetLegalDocuments()
    router.setCurrentUrl(Routes.accountAgreements)
})

const renderPage = async (redirectUrl?: string) => {
    renderWithProviders(await AgreementsPage({ searchParams: Promise.resolve({ redirect_url: redirectUrl }) }))
}

const userOwing = async (...types: Array<'TOS' | 'PN'>) => {
    const session = await mockSessionWithTestData()
    const versions = []
    for (const type of types) versions.push(await insertTestLegalDocument({ type, publishedBy: session.user.id }))
    return { ...session, versions }
}

const checkAndContinue = async () => {
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

const acknowledgedVersionIds = async (userId: string) =>
    (
        await db
            .selectFrom('legalDocumentAcknowledgement')
            .select('legalDocumentVersionId')
            .where('userId', '=', userId)
            .execute()
    ).map((ack) => ack.legalDocumentVersionId)

// All three columns together, or the row fails its draft-or-published check constraint.
const unpublish = (versionId: string) =>
    db
        .updateTable('legalDocumentVersion')
        .set({ publishedAt: null, publishedBy: null, versionNumber: null })
        .where('id', '=', versionId)
        .execute()

describe('AgreementsPage', () => {
    it('records the acknowledgement and continues to the page the user asked for', async () => {
        const { user, org, versions } = await userOwing('TOS', 'PN')
        const studyPage = `${Routes.studyReview({ orgSlug: org.slug, studyId: faker.string.uuid() })}?tab=code`
        await renderPage(studyPage)

        // One checkbox naming both: the pair is asked about once.
        expect(
            screen.getByRole('checkbox', { name: 'I have read and agree to the Terms of Service and Privacy Notice.' }),
        ).toBeDefined()
        await checkAndContinue()

        await waitFor(() => expect(router.asPath).toBe(studyPage))
        expect(await acknowledgedVersionIds(user.id)).toEqual(expect.arrayContaining(versions.map((v) => v.id)))
    })

    it('continues to My dashboard without a destination', async () => {
        await userOwing('TOS')
        await renderPage()

        await checkAndContinue()

        await waitFor(() => expect(router.asPath).toBe(Routes.dashboard))
    })

    it('sends a user who owes nothing straight on', async () => {
        await mockSessionWithTestData()

        await renderPage(Routes.researcherStudies)

        expect(redirect).toHaveBeenCalledWith(Routes.researcherStudies)
    })

    it('never names itself as the destination', async () => {
        await mockSessionWithTestData()

        await renderPage(Routes.accountAgreements)

        expect(redirect).toHaveBeenCalledWith(Routes.dashboard)
    })

    // Matched whole: the thrown ActionFailure's message is the JSON of its field errors, which a
    // looser match would still satisfy.
    it('stays on the step with the reason when an acknowledgement is refused', async () => {
        const { user, versions } = await userOwing('TOS')
        await renderPage(Routes.researcherStudies)
        await unpublish(versions[0]!.id)

        await checkAndContinue()

        expect(await screen.findByText('Version is not published and cannot be acknowledged')).toBeDefined()
        expect(await acknowledgedVersionIds(user.id)).toEqual([])
        expect(router.asPath).toBe(Routes.accountAgreements)
    })

    // Acknowledged in turn, so a refusal partway leaves the earlier row recorded and the step up.
    it('keeps the first acknowledgement when the second is refused', async () => {
        const { user, versions } = await userOwing('TOS', 'PN')
        await renderPage()
        await unpublish(versions[1]!.id)

        await checkAndContinue()

        expect(await screen.findByText('Version is not published and cannot be acknowledged')).toBeDefined()
        expect(await acknowledgedVersionIds(user.id)).toEqual([versions[0]!.id])
        expect(router.asPath).toBe(Routes.accountAgreements)
    })
})
