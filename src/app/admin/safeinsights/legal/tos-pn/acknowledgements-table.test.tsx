import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { faker } from '@faker-js/faker'
import dayjs from 'dayjs'
import {
    actionResult,
    db,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
} from '@/tests/unit.helpers'
import {
    acknowledgeLegalDocumentAction,
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { ACKNOWLEDGEMENTS_PAGE_SIZE, AcknowledgementsTable } from './acknowledgements-table'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

beforeEach(resetLegalDocuments)

const publishTos = async () => {
    const { version } = actionResult(await createLegalDocumentDraftAction({ type: 'TOS', fileName: 'terms.md' }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id }))
}

// Inserted directly so fullName sorts predictably; insertTestUser picks faker names.
const insertNamedUser = async (firstName: string) => {
    const email = `${faker.string.alpha(10)}@test.com`
    await db
        .insertInto('user')
        .values({ clerkId: faker.string.alpha(10), firstName, lastName: 'Sorter', email })
        .execute()
    return email
}

// The audience is every user in the shared database, so assert on the sorted top row rather than
// on which rows exist. Index 0 is the header.
const topRowText = () => screen.getAllByRole('row')[1]?.textContent ?? ''

// A faker name sorts anywhere, so on a shared database the row lands on page two and the lookup
// fails for unrelated reasons.
const sortNearFront = (userId: string) =>
    db.updateTable('user').set({ firstName: 'Aaa', lastName: 'Sorter' }).where('id', '=', userId).execute()

describe('AcknowledgementsTable', () => {
    it('lists a user who has agreed to nothing', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        await sortNearFront(user.id)
        await publishTos()

        renderWithProviders(<AcknowledgementsTable type="TOS" />)

        const row = await screen.findByText(user.email!)
        expect(row.closest('tr')?.textContent).toContain('None')
    })

    it('reports the version a user agreed to and when', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        await sortNearFront(user.id)
        const published = await publishTos()
        actionResult(await acknowledgeLegalDocumentAction({ versionId: published.id }))

        renderWithProviders(<AcknowledgementsTable type="TOS" />)

        const row = (await screen.findByText(user.email!)).closest('tr')
        expect(row?.textContent).toContain(dayjs().format('MMM DD, YYYY'))
        expect(row?.textContent).not.toContain('None')
    })

    it('re-reads the audience in the other direction when a sortable column is clicked', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const first = await insertNamedUser('Aaa')
        const last = await insertNamedUser('Zzz')

        renderWithProviders(<AcknowledgementsTable type="TOS" />)

        await screen.findByText(first)
        expect(topRowText()).toContain(first)

        fireEvent.click(document.querySelector('th[data-accessor="fullName"]') as HTMLElement)

        await waitFor(() => expect(topRowText()).toContain(last))
    })

    it('shows one page of users at a time', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await db
            .insertInto('user')
            .values(
                Array.from({ length: ACKNOWLEDGEMENTS_PAGE_SIZE + 1 }, () => ({
                    clerkId: faker.string.alpha(10),
                    firstName: faker.person.firstName(),
                    lastName: faker.person.lastName(),
                    email: `${faker.string.alpha(10)}@test.com`,
                })),
            )
            .execute()

        renderWithProviders(<AcknowledgementsTable type="TOS" />)

        await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(ACKNOWLEDGEMENTS_PAGE_SIZE + 1))
        expect(screen.getByRole('button', { name: '2' })).toBeDefined()
    })
})
