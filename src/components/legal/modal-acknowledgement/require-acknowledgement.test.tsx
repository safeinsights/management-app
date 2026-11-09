import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { db } from '@/database'
import { Routes } from '@/lib/routes'
import {
    act,
    actionResult,
    faker,
    insertTestOrg,
    mockPathname,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
    testUploadFile,
    userEvent,
} from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { RequireLegalAcknowledgement } from './require-acknowledgement'

// The upload happens client-side, so only the AWS boundary is stubbed.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        storeS3File: vi.fn(),
    }
})

// The gate answers for every published tos/pn, so a seeded database would leave a second
// document outstanding behind the one under test. Off /legal, which the gate leaves uncovered.
beforeEach(async () => {
    await resetLegalDocuments()
    mockPathname(Routes.dashboard)
})

const publish = async (type: 'TOS' | 'PN', fileName: string) => {
    const { version } = actionResult(await createLegalDocumentDraftAction({ type, file: testUploadFile(fileName) }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id }))
}

const publishTos = () => publish('TOS', 'terms.md')

const publishRopa = async () => {
    const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type: 'ROPA', orgId: org.id, file: testUploadFile('agreement.pdf') }),
    )
    actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt: '2026-07-27' }))
    return org
}

const gate = () => screen.findByRole('dialog', { name: 'Welcome to SafeInsights!' })

const checkAndContinue = async () => {
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

const acknowledgementsFor = (userId: string) =>
    db
        .selectFrom('legalDocumentAcknowledgement')
        .selectAll('legalDocumentAcknowledgement')
        .where('userId', '=', userId)
        .execute()

describe('RequireLegalAcknowledgement', () => {
    it('stays out of the way when nothing is outstanding', async () => {
        await mockSessionWithTestData()

        renderWithProviders(<RequireLegalAcknowledgement />)

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('records the acknowledgement and lets the user through', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const version = await publishTos()

        const { user } = await mockSessionWithTestData()
        renderWithProviders(<RequireLegalAcknowledgement />)

        expect(await gate()).toBeDefined()
        await checkAndContinue()

        await waitFor(async () => {
            const acks = await acknowledgementsFor(user.id)
            expect(acks).toHaveLength(1)
            expect(acks[0]!.legalDocumentVersionId).toBe(version.id)
        })
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('asks about the Terms of Service and Privacy Notice together, and a ropa separately', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await publishTos()
        await publish('PN', 'privacy.md')
        const org = await publishRopa()

        const { user } = await mockSessionWithTestData({ orgSlug: org.slug, orgType: 'lab' })
        renderWithProviders(<RequireLegalAcknowledgement />)

        expect(await gate()).toBeDefined()
        // One checkbox naming both: the pair is asked about once.
        expect(
            screen.getByRole('checkbox', { name: 'I have read and agree to the Terms of Service and Privacy Notice.' }),
        ).toBeDefined()
        expect(screen.getAllByRole('checkbox')).toHaveLength(1)

        await checkAndContinue()

        await waitFor(async () => expect(await acknowledgementsFor(user.id)).toHaveLength(2))
        await waitFor(() =>
            expect(screen.getByRole('dialog').textContent).toMatch(
                /The Research Organization Participation Agreement for .* is now available/,
            ),
        )
        expect(screen.getByRole('checkbox')).not.toBeChecked()
        // ropa/dopa keep their own modal, Sign out included.
        expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined()

        await checkAndContinue()

        await waitFor(async () => expect(await acknowledgementsFor(user.id)).toHaveLength(3))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    // The gate's links open /legal in a new tab, which must not be covered by the same gate.
    it('leaves the legal page uncovered while a document is owed', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await publishTos()

        await mockSessionWithTestData()
        renderWithProviders(<RequireLegalAcknowledgement />)
        expect(await gate()).toBeDefined()

        act(() => mockPathname(Routes.legal))

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    // Acknowledged in turn, so a refusal partway leaves the earlier row recorded and the gate up.
    it('keeps the gate open with the reason when the second of two acknowledgements is refused', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const tos = await publishTos()
        const pn = await publish('PN', 'privacy.md')

        const { user } = await mockSessionWithTestData()
        renderWithProviders(<RequireLegalAcknowledgement />)
        expect(await gate()).toBeDefined()

        // All three columns together, or the row fails its draft-or-published check constraint.
        await db
            .updateTable('legalDocumentVersion')
            .set({ publishedAt: null, publishedBy: null, versionNumber: null })
            .where('id', '=', pn.id)
            .execute()

        await checkAndContinue()

        expect(await screen.findByText('Version is not published and cannot be acknowledged')).toBeDefined()
        const acks = await acknowledgementsFor(user.id)
        expect(acks.map((ack) => ack.legalDocumentVersionId)).toEqual([tos.id])
        expect(screen.getByRole('dialog', { name: 'Welcome to SafeInsights!' })).toBeDefined()
    })

    // Matched whole: the thrown ActionFailure's message is the JSON of its field errors, which a
    // looser match would still satisfy.
    it('shows why an acknowledgement was refused rather than silently reopening', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const version = await publishTos()

        const { user } = await mockSessionWithTestData()
        renderWithProviders(<RequireLegalAcknowledgement />)
        expect(await gate()).toBeDefined()

        // All three columns together, or the row fails its draft-or-published check constraint.
        await db
            .updateTable('legalDocumentVersion')
            .set({ publishedAt: null, publishedBy: null, versionNumber: null })
            .where('id', '=', version.id)
            .execute()

        await checkAndContinue()

        expect(await screen.findByText('Version is not published and cannot be acknowledged')).toBeDefined()
        expect(await acknowledgementsFor(user.id)).toHaveLength(0)
    })
})
