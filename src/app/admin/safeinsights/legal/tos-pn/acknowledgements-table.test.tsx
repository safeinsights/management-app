import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { faker } from '@faker-js/faker'
import dayjs from 'dayjs'
import { EMPTY_CELL } from '@/lib/dates'
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

// Inserted straight into the table so the generated fullName sorts predictably; insertTestUser picks
// its names from faker.
const insertNamedUser = async (firstName: string) => {
    const email = `${faker.string.alpha(10)}@test.com`
    await db
        .insertInto('user')
        .values({ clerkId: faker.string.alpha(10), firstName, lastName: 'Sorter', email })
        .execute()
    return email
}

// The audience is every user in the database, not just the ones a test inserts, so any run whose
// database already holds a page of users leaves the ascending-last name off page one entirely.
// Reading the top row of the sorted page keeps the assertion about the sort direction rather than
// about how many rows happen to exist. Index 0 is the header row.
const topRowText = () => screen.getAllByRole('row')[1]?.textContent ?? ''

// Same hazard, for the two tests that look up one specific row: a faker name sorts anywhere, so
// once the shared database holds 25 users ahead of it the row is on page two and the lookup fails
// for reasons that have nothing to do with acknowledgements. Renaming to sort near the front keeps
// the row on page one without asserting anything about how many users exist. Not `topRowText`:
// these tests may run with each other's sort-first users already inserted, so they must find their
// own row rather than assume it is on top.
const sortNearFront = (userId: string) =>
    db.updateTable('user').set({ firstName: 'Aaa', lastName: 'Sorter' }).where('id', '=', userId).execute()

// Read positionally: a dash also appears in the org and acknowledgement columns.
const lastLoginCell = async (email: string) => {
    const row = (await screen.findByText(email)).closest('tr')
    const cells = row?.querySelectorAll('td') ?? []
    return cells[cells.length - 1]?.textContent
}

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

    it('names every org the user belongs to', async () => {
        const { user, org } = await mockSessionWithTestData({ isSiAdmin: true })
        await sortNearFront(user.id)
        await publishTos()

        renderWithProviders(<AcknowledgementsTable type="TOS" />)

        const row = (await screen.findByText(user.email!)).closest('tr')
        expect(row?.textContent).toContain(org.name)
    })

    it('re-reads the audience in the other direction when a sortable column is clicked', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const first = await insertNamedUser('Aaa')
        const last = await insertNamedUser('Zzz')

        renderWithProviders(<AcknowledgementsTable type="TOS" />)

        // 'Aaa'/'Zzz' bracket any real name, so each is the top row in one direction. The table
        // opens on fullName ascending (DEFAULT_SORT).
        await screen.findByText(first)
        expect(topRowText()).toContain(first)

        // mantine-datatable puts the sort handler on the header cell itself, tagged with its accessor.
        fireEvent.click(document.querySelector('th[data-accessor="fullName"]') as HTMLElement)

        await waitFor(() => expect(topRowText()).toContain(last))
    })

    it('reports when a user last logged in', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        await sortNearFront(user.id)
        await publishTos()
        await db
            .insertInto('audit')
            .values({
                userId: user.id,
                recordId: user.id,
                recordType: 'USER',
                eventType: 'LOGGED_IN',
                createdAt: new Date('2026-04-02T00:00:00Z'),
            })
            .execute()

        renderWithProviders(<AcknowledgementsTable type="TOS" />)

        expect(await lastLoginCell(user.email!)).toBe('Apr 02, 2026')
    })

    it('shows a dash for a user the login trail has never seen', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        await sortNearFront(user.id)
        await publishTos()

        renderWithProviders(<AcknowledgementsTable type="TOS" />)

        expect(await lastLoginCell(user.email!)).toBe(EMPTY_CELL)
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

        // One header row on top of the page's records.
        await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(ACKNOWLEDGEMENTS_PAGE_SIZE + 1))
        expect(screen.getByRole('button', { name: '2' })).toBeDefined()
    })
})
