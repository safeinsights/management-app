import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db } from '@/database'
import {
    actionResult,
    faker,
    insertTestOrg,
    insertTestUser,
    mockSessionWithTestData,
    renderWithProviders,
} from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { OrgStudyAgreements } from './org-study-agreements'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        // Implementations are passed to vi.fn rather than set with mockResolvedValue: the suite runs
        // with mockReset, which restores the implementation given here but wipes a value set after.
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

const insertApprovedStudy = async ({
    dataPartnerId,
    researchLabId,
    researcherId,
    title,
}: {
    dataPartnerId: string
    researchLabId: string
    researcherId: string
    title: string
}) =>
    await db
        .insertInto('study')
        .values({
            orgId: dataPartnerId,
            submittedByOrgId: researchLabId,
            containerLocation: 'test-container',
            title,
            researcherId,
            piName: 'test',
            status: 'APPROVED',
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: 'R',
        })
        .returningAll()
        .executeTakeFirstOrThrow()

// A Data Partner whose admin is the signed-in user, so the panel reads its own org's rows. The
// Research Lab is a separate org, which is what the counterparty column must name.
const seedDataPartnerWithStudy = async (title: string) => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { user: researcher } = await insertTestUser({
        org: { id: researchLab.id, slug: researchLab.slug, type: 'lab' },
    })
    const study = await insertApprovedStudy({
        dataPartnerId: dataPartner.id,
        researchLabId: researchLab.id,
        researcherId: researcher.id,
        title,
    })

    return { study, dataPartner, researchLab, researcherId: researcher.id }
}

const publishAgreement = async (studyId: string, signedAt: string) => {
    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type: 'SLA', studyId, fileName: 'agreement.pdf' }),
    )
    actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
}

const rowFor = async (title: string) => {
    await waitFor(() => expect(screen.getByText(title)).toBeDefined())
    const row = screen.getByText(title).closest('tr')
    if (!row) throw new Error(`no table row for ${title}`)
    return row
}

describe('OrgStudyAgreements', () => {
    it('shows an em dash for Effective on and View while nothing is signed', async () => {
        const title = `Awaiting ${faker.string.alpha(6)}`
        const { dataPartner, researchLab } = await seedDataPartnerWithStudy(title)
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)

        const row = await rowFor(title)
        expect(within(row).getByText(researchLab.name)).toBeDefined()
        expect(within(row).queryByRole('link', { name: /PDF/ })).toBeNull()
        expect(within(row).getAllByText('—')).toHaveLength(2)
    })

    it('links to the PDF and shows the signed date once an agreement is published', async () => {
        const title = `Signed ${faker.string.alpha(6)}`
        const { study, dataPartner } = await seedDataPartnerWithStudy(title)
        await publishAgreement(study.id, '2026-06-17')
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)

        const row = await rowFor(title)
        expect(within(row).getByText('Jun 17, 2026')).toBeDefined()
        expect(within(row).getByRole('link', { name: /PDF/ })).toHaveProperty(
            'href',
            'https://mock-signed-url.example.com/file',
        )
    })

    it('heads the counterparty column From for a Data Partner and To for a Research Lab', async () => {
        const title = `Counterparty ${faker.string.alpha(6)}`
        const { dataPartner } = await seedDataPartnerWithStudy(title)
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        const { unmount } = renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)
        await waitFor(() => expect(screen.getByRole('columnheader', { name: 'From' })).toBeDefined())
        unmount()

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="lab" />)
        await waitFor(() => expect(screen.getByRole('columnheader', { name: 'To' })).toBeDefined())
    })

    it('renders the empty state when the org has no studies at the agreement stage', async () => {
        const { org } = await mockSessionWithTestData({
            orgSlug: faker.string.alpha(10),
            orgType: 'enclave',
            isAdmin: true,
        })

        renderWithProviders(<OrgStudyAgreements orgSlug={org.slug} orgType="enclave" />)

        await waitFor(() => expect(screen.getByText('No Study Agreement yet.')).toBeDefined())
        expect(
            screen.getByText('Once a study reaches the agreement stage, its Study Agreement will appear here.'),
        ).toBeDefined()
    })

    it('keeps unsigned studies last when the admin sorts by Effective on', async () => {
        const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user: researcher } = await insertTestUser({
            org: { id: researchLab.id, slug: researchLab.slug, type: 'lab' },
        })
        const signedTitle = `Signed ${faker.string.alpha(6)}`
        const unsignedTitle = `Unsigned ${faker.string.alpha(6)}`
        const signed = await insertApprovedStudy({
            dataPartnerId: dataPartner.id,
            researchLabId: researchLab.id,
            researcherId: researcher.id,
            title: signedTitle,
        })
        await insertApprovedStudy({
            dataPartnerId: dataPartner.id,
            researchLabId: researchLab.id,
            researcherId: researcher.id,
            title: unsignedTitle,
        })
        await publishAgreement(signed.id, '2026-02-02')
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)
        await rowFor(signedTitle)

        // Ascending would put the earliest date first; the study with no date still sorts last.
        // Clicked through the header's text rather than by role: a sortable header is a button whose
        // accessible name also carries the sort-direction icon.
        const header = screen.getByText('Effective on').closest('th')
        if (!header) throw new Error('no Effective on header')
        fireEvent.click(header)

        await waitFor(() => {
            const titles = screen
                .getAllByRole('row')
                .slice(1)
                .map((row) => row.textContent ?? '')
            expect(titles[titles.length - 1]).toContain(unsignedTitle)
        })
    })
})
