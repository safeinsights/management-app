import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
    actionResult,
    db,
    faker,
    insertTestOrg,
    insertTestStudyOnly,
    mockClerkSession,
    mockSessionWithTestData,
    renderWithProviders,
} from '@/tests/unit.helpers'
import {
    acknowledgeLegalDocumentAction,
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { UserStudyAgreements } from './user-study-agreements'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        // Implementations, not mockResolvedValue: mockReset wipes the latter.
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

// Publishing replaces the session with an SI admin's, so the reader's is restored before acking.
const asReader = (
    user: { id: string; clerkId: string; email: string | null },
    org: { id: string; slug: string; type: 'enclave' | 'lab' },
) =>
    mockClerkSession({
        userId: user.id,
        clerkUserId: user.clerkId,
        email: user.email ?? undefined,
        orgSlug: org.slug,
        orgId: org.id,
        roles: { isAdmin: false },
        orgType: org.type,
    })

const seedAcknowledgedAgreement = async (title: string, signedAt: string) => {
    const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
    const dataPartner = { id: org.id, slug: org.slug, type: 'enclave' as const }
    const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { study } = await insertTestStudyOnly({
        org: dataPartner,
        submittedByOrg: researchLab,
        title,
        status: 'APPROVED',
    })

    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type: 'SLA', studyId: study.id, fileName: 'agreement.pdf' }),
    )
    actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))

    await asReader(user, dataPartner)
    actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))

    return { study, dataPartner, researchLab, dataPartnerName: org.name, user, version }
}

// Postgres now() is the transaction clock, so two acks written back to back can share a timestamp.
const setAckedAt = (versionId: string, ackedAt: Date) =>
    db
        .updateTable('legalDocumentAcknowledgement')
        .set({ ackedAt })
        .where('legalDocumentVersionId', '=', versionId)
        .execute()

const rowFor = async (title: string) => {
    await waitFor(() => expect(screen.getByText(title)).toBeDefined())
    const row = screen.getByText(title).closest('tr')
    if (!row) throw new Error(`no table row for ${title}`)
    return row
}

const rowTitles = () =>
    screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent ?? '')

describe('UserStudyAgreements', () => {
    it('names both parties and links the PDF for an acknowledged agreement', async () => {
        const title = `Signed ${faker.string.alpha(6)}`
        const { study, researchLab, dataPartnerName, version } = await seedAcknowledgedAgreement(title, '2026-06-17')
        await setAckedAt(version.id, new Date('2026-06-20T12:00:00Z'))

        renderWithProviders(<UserStudyAgreements />)

        const row = await rowFor(title)
        expect(within(row).getByText(study.id)).toBeDefined()
        expect(within(row).getByText(researchLab.name)).toBeDefined()
        expect(within(row).getByText(dataPartnerName)).toBeDefined()
        expect(within(row).getByText('Jun 17, 2026')).toBeDefined()
        expect(within(row).getByText('Jun 20, 2026')).toBeDefined()
        expect(within(row).getByRole('link', { name: /PDF/ })).toHaveProperty(
            'href',
            'https://mock-signed-url.example.com/file',
        )
    })

    it('renders the empty state for a user who has acknowledged nothing', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        renderWithProviders(<UserStudyAgreements />)

        await waitFor(() =>
            expect(screen.getByText('You have not acknowledged any Study Agreements yet')).toBeDefined(),
        )
    })

    it('leads with the most recently acknowledged agreement and flips on click', async () => {
        const older = `Older ${faker.string.alpha(6)}`
        const newer = `Newer ${faker.string.alpha(6)}`
        const olderSeed = await seedAcknowledgedAgreement(older, '2026-02-02')
        const { user, dataPartner } = olderSeed
        await setAckedAt(olderSeed.version.id, new Date('2026-03-01T12:00:00Z'))

        const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { study } = await insertTestStudyOnly({
            org: dataPartner,
            submittedByOrg: researchLab,
            title: newer,
            status: 'APPROVED',
        })
        await mockSessionWithTestData({ isSiAdmin: true })
        const { version } = actionResult(
            await createLegalDocumentDraftAction({ type: 'SLA', studyId: study.id, fileName: 'agreement.pdf' }),
        )
        actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt: '2026-01-01' }))
        await asReader(user, dataPartner)
        actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))
        await setAckedAt(version.id, new Date('2026-08-01T12:00:00Z'))

        renderWithProviders(<UserStudyAgreements />)
        await rowFor(newer)

        // Acknowledged on desc, so the later ack leads even though its Effective on is the earlier.
        await waitFor(() => expect(rowTitles()[0]).toContain(newer))

        // Through the header's text: a sortable header's accessible name carries the sort icon too.
        const header = screen.getByText('Acknowledged on').closest('th')
        if (!header) throw new Error('no Acknowledged on header')
        fireEvent.click(header)

        await waitFor(() => expect(rowTitles()[0]).toContain(older))
    })
})
