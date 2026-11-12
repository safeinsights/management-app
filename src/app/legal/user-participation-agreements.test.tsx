import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
    actionResult,
    db,
    faker,
    isSortableHeader,
    mockSessionWithTestData,
    renderWithProviders,
    testUploadFile,
} from '@/tests/unit.helpers'
import { acknowledgeLegalDocumentAction } from '@/server/actions/legal-acknowledgement.actions'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { UserParticipationAgreements } from './user-participation-agreements'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        storeS3File: vi.fn(),
    }
})

const seedAcknowledgedAgreement = async (type: 'DOPA' | 'ROPA', signedAt: string) => {
    const orgType = type === 'DOPA' ? 'enclave' : 'lab'
    const { org, restoreSession } = await mockSessionWithTestData({ orgType })

    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type, orgId: org.id, file: testUploadFile('agreement.pdf') }),
    )
    actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))

    restoreSession()
    actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))

    return { org, version }
}

describe('UserParticipationAgreements', () => {
    it('shows the organization, the effective date and a PDF link for an acknowledged DOPA', async () => {
        const { org, version } = await seedAcknowledgedAgreement('DOPA', '2026-04-04')

        renderWithProviders(<UserParticipationAgreements type="DOPA" />)

        await waitFor(() => expect(screen.getByText(org.name)).toBeDefined())
        const row = screen.getByText(org.name).closest('tr')
        if (!row) throw new Error('no row for the org')
        expect(within(row).getByText('Apr 04, 2026')).toBeDefined()
        expect(within(row).getByRole('link', { name: /PDF/ })).toHaveAttribute('href', `/dl/legal/${version.id}`)
    })

    it('heads the name column "Organization name"', async () => {
        await seedAcknowledgedAgreement('DOPA', '2026-04-04')

        renderWithProviders(<UserParticipationAgreements type="DOPA" />)

        await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Organization name' })).toBeDefined())
    })

    it("puts the new-tab icon on the View header and says so in each PDF link's name", async () => {
        const { org } = await seedAcknowledgedAgreement('DOPA', '2026-04-04')

        renderWithProviders(<UserParticipationAgreements type="DOPA" />)

        await waitFor(() => expect(screen.getByText(org.name)).toBeDefined())
        const header = screen.getByRole('columnheader', { name: 'View' })
        expect(header.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

        const link = screen.getByRole('link', { name: 'View PDF in a new tab' })
        expect(link).toHaveTextContent(/^PDF$/)
        expect(link.querySelector('svg')).toBeNull()
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noreferrer')
    })

    it.each([
        ['hovered', (link: HTMLElement) => fireEvent.mouseEnter(link)],
        ['focused', (link: HTMLElement) => link.focus()],
    ])('says the PDF opens in a new tab when its link is %s', async (_, reach) => {
        const { org } = await seedAcknowledgedAgreement('DOPA', '2026-04-04')

        renderWithProviders(<UserParticipationAgreements type="DOPA" />)

        await waitFor(() => expect(screen.getByText(org.name)).toBeDefined())
        reach(screen.getByRole('link', { name: 'View PDF in a new tab' }))
        await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('View PDF in a new tab'))
    })

    it('shows a long organization name in full in a tooltip, without linking it', async () => {
        const { org } = await seedAcknowledgedAgreement('DOPA', '2026-04-04')
        const name = `${org.name} ${faker.lorem.words(30)}`
        await db.updateTable('org').set({ name }).where('id', '=', org.id).execute()

        renderWithProviders(<UserParticipationAgreements type="DOPA" />)

        await waitFor(() => expect(screen.getByText(name)).toBeDefined())
        const nameText = screen.getByText(name)
        expect(nameText.closest('a')).toBeNull()
        const cell = nameText.closest('td')
        expect(cell).toHaveClass('mantine-datatable-ellipsis')
        expect(cell).toHaveStyle({ width: '100%', maxWidth: '0' })

        fireEvent.mouseEnter(nameText)
        await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent(name))
    })

    it('offers no column to sort by', async () => {
        const { org } = await seedAcknowledgedAgreement('DOPA', '2026-04-04')

        renderWithProviders(<UserParticipationAgreements type="DOPA" />)

        await waitFor(() => expect(screen.getByText(org.name)).toBeDefined())
        expect(isSortableHeader('Organization name')).toBe(false)
        expect(isSortableHeader('Effective on')).toBe(false)
        expect(isSortableHeader('Acknowledged on')).toBe(false)
    })

    it('does not show a DOPA on the ROPA tab', async () => {
        await seedAcknowledgedAgreement('DOPA', '2026-04-04')

        renderWithProviders(<UserParticipationAgreements type="ROPA" />)

        expect(screen.getByRole('heading', { name: 'Research Organization Participation Agreement' })).toBeDefined()
        await waitFor(() =>
            expect(
                screen.getByText('You have not acknowledged any Research Organization Participation Agreements yet'),
            ).toBeDefined(),
        )
    })

    it('names the type in the empty state and the heading', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        renderWithProviders(<UserParticipationAgreements type="DOPA" />)

        expect(screen.getByRole('heading', { name: 'Data Organization Participation Agreement' })).toBeDefined()
        await waitFor(() =>
            expect(
                screen.getByText('You have not acknowledged any Data Organization Participation Agreements yet'),
            ).toBeDefined(),
        )
    })
})
