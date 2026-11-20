import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
    actionResult,
    db,
    faker,
    insertTestOrg,
    insertTestStudyOnly,
    isSortableHeader,
    mockSessionWithTestData,
    renderWithProviders,
    tableHeader,
    testUploadFile,
} from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { Routes } from '@/lib/routes'
import { EMPTY_CELL } from '@/lib/dates'
import { OrgStudyAgreements } from './org-study-agreements'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        // Implementations, not mockResolvedValue: mockReset restores these but wipes a value set
        // afterwards.
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        storeS3File: vi.fn(),
    }
})

// Separate orgs, so a swapped join in the counterparty column cannot pass.
const insertPartyOrgs = async () => ({
    dataPartner: await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' }),
    researchLab: await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' }),
})

const seedDataPartnerWithStudy = async (title: string) => {
    const { dataPartner, researchLab } = await insertPartyOrgs()
    const { study } = await insertTestStudyOnly({
        org: dataPartner,
        submittedByOrg: researchLab,
        title,
        withStudyAgreement: false,
    })

    return { study, dataPartner, researchLab }
}

const publishAgreement = async (studyId: string, signedAt: string) => {
    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type: 'SLA', studyId, file: testUploadFile('agreement.pdf') }),
    )
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
}

const rowTitles = () =>
    screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent ?? '')

const rowFor = async (title: string) => {
    await waitFor(() => expect(screen.getByText(title)).toBeDefined())
    const row = screen.getByText(title).closest('tr')
    if (!row) throw new Error(`no table row for ${title}`)
    return row
}

describe('OrgStudyAgreements', () => {
    it('shows Not ready for Effective on and an em dash for View while nothing is signed', async () => {
        const title = `Awaiting ${faker.string.alpha(6)}`
        const { dataPartner, researchLab } = await seedDataPartnerWithStudy(title)
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)

        const row = await rowFor(title)
        expect(within(row).getByText(researchLab.name)).toBeDefined()
        expect(within(row).queryByRole('link', { name: /PDF/ })).toBeNull()
        expect(within(row).getByText('Not ready')).toBeDefined()
        expect(within(row).getAllByText(EMPTY_CELL)).toHaveLength(1)
    })

    it('links a Data Partner admin to the review page of the study', async () => {
        const title = `Review ${faker.string.alpha(6)}`
        const { study, dataPartner } = await seedDataPartnerWithStudy(title)
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)

        const row = await rowFor(title)
        expect(within(row).getByRole('link', { name: title })).toHaveAttribute(
            'href',
            Routes.studyReview({ orgSlug: dataPartner.slug, studyId: study.id }),
        )
    })

    it('links a Research Lab admin to the researcher view of the study', async () => {
        const title = `View ${faker.string.alpha(6)}`
        const { study, researchLab } = await seedDataPartnerWithStudy(title)
        await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={researchLab.slug} orgType="lab" />)

        const row = await rowFor(title)
        expect(within(row).getByRole('link', { name: title })).toHaveAttribute(
            'href',
            Routes.studyView({ orgSlug: researchLab.slug, studyId: study.id }),
        )
    })

    it('marks a test study exempt instead of showing an effective date', async () => {
        const title = `Test ${faker.string.alpha(6)}`
        const { study, dataPartner } = await seedDataPartnerWithStudy(title)
        await db.updateTable('study').set({ isTestStudy: true }).where('id', '=', study.id).execute()
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)

        const row = await rowFor(title)
        expect(within(row).getByText('Test study')).toBeDefined()
        expect(within(row).queryByText('Not ready')).toBeNull()
        expect(within(row).queryByRole('link', { name: /PDF/ })).toBeNull()
    })

    it('links to the PDF and shows the signed date once an agreement is published', async () => {
        const title = `Signed ${faker.string.alpha(6)}`
        const { study, dataPartner } = await seedDataPartnerWithStudy(title)
        const version = await publishAgreement(study.id, '2026-06-17')
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)

        const row = await rowFor(title)
        expect(within(row).getByText('Jun 17, 2026')).toBeDefined()
        expect(within(row).getByRole('link', { name: /PDF/ })).toHaveAttribute('href', `/dl/legal/${version.id}`)
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
        expect(screen.getByRole('heading', { name: 'Study Agreement' })).toBeDefined()
        expect(
            screen.getByText('Once a study reaches the agreement stage, its Study Agreement will appear here.'),
        ).toBeDefined()
    })

    it('leads with the newest study and flips on a Study ID click', async () => {
        const { dataPartner, researchLab } = await insertPartyOrgs()
        const olderTitle = `Older ${faker.string.alpha(6)}`
        const newerTitle = `Newer ${faker.string.alpha(6)}`
        const insertStudy = (title: string) =>
            insertTestStudyOnly({ org: dataPartner, submittedByOrg: researchLab, title, withStudyAgreement: false })
        const { study: older } = await insertStudy(olderTitle)
        // Only the older study is signed, so it would lead if the table defaulted to Effective on.
        await publishAgreement(older.id, '2026-02-02')
        // Inserted second, so its v7 id sorts after the first's.
        await insertStudy(newerTitle)
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)
        await rowFor(olderTitle)

        await waitFor(() => expect(rowTitles()[0]).toContain(newerTitle))

        fireEvent.click(tableHeader('Study ID'))

        await waitFor(() => expect(rowTitles()[0]).toContain(olderTitle))
    })

    it('sorts by Study ID, Study title and Effective on only', async () => {
        const { dataPartner } = await seedDataPartnerWithStudy(`Awaiting ${faker.string.alpha(6)}`)
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)
        await waitFor(() => expect(rowTitles()).toHaveLength(1))

        expect(isSortableHeader('Study ID')).toBe(true)
        expect(isSortableHeader('Study title')).toBe(true)
        expect(isSortableHeader('Effective on')).toBe(true)
        expect(isSortableHeader('From')).toBe(false)
    })

    it('has no Acknowledged on column', async () => {
        const title = `Signed ${faker.string.alpha(6)}`
        const { study, dataPartner } = await seedDataPartnerWithStudy(title)
        await publishAgreement(study.id, '2026-06-17')
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)

        await rowFor(title)
        expect(screen.queryByText('Acknowledged on')).toBeNull()
    })

    it('orders by effective date on an Effective on click, keeping an unsigned study last', async () => {
        const { dataPartner, researchLab } = await insertPartyOrgs()
        const insertStudy = async (title: string) =>
            (
                await insertTestStudyOnly({
                    org: dataPartner,
                    submittedByOrg: researchLab,
                    title,
                    withStudyAgreement: false,
                })
            ).study
        const earlier = `Earlier ${faker.string.alpha(6)}`
        const later = `Later ${faker.string.alpha(6)}`
        const unsigned = `Unsigned ${faker.string.alpha(6)}`
        await publishAgreement((await insertStudy(earlier)).id, '2026-02-02')
        await publishAgreement((await insertStudy(later)).id, '2026-05-05')
        await insertStudy(unsigned)
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })
        const expectRowOrder = (titles: string[]) =>
            waitFor(() => titles.forEach((title, index) => expect(rowTitles()[index]).toContain(title)))

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)
        await rowFor(unsigned)

        // A newly clicked column keeps the direction in force, and the default sort is descending.
        fireEvent.click(tableHeader('Effective on'))
        await expectRowOrder([later, earlier, unsigned])

        fireEvent.click(tableHeader('Effective on'))
        await expectRowOrder([earlier, later, unsigned])
    })

    it('clamps the Study ID to its column and shows it in full in a tooltip', async () => {
        const { study, dataPartner } = await seedDataPartnerWithStudy(`Clamped ${faker.string.alpha(6)}`)
        await mockSessionWithTestData({ orgSlug: dataPartner.slug, orgType: 'enclave', isAdmin: true })

        renderWithProviders(<OrgStudyAgreements orgSlug={dataPartner.slug} orgType="enclave" />)

        await waitFor(() => expect(screen.getByText(study.id)).toBeDefined())
        const idText = screen.getByText(study.id)
        expect(idText.closest('td')).toHaveStyle({ maxWidth: '0' })

        fireEvent.mouseEnter(idText)
        await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent(study.id))
    })
})
