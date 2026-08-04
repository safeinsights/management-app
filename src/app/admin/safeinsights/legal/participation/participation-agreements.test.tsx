import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { actionResult, faker, insertTestOrg, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { ParticipationAgreements } from './participation-agreements'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        // Implementations are passed to vi.fn rather than set with mockResolvedValue: the suite runs
        // with mockReset, which restores the implementation given here but wipes a value set after.
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrl: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

const seedDataPartner = () => insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })

const seedSignedDopa = async (signedAt: string) => {
    const org = await seedDataPartner()
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type: 'dopa', orgId: org.id, fileName: 'dopa.pdf' }),
    )
    actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
    return org
}

// Scoped to one org's row: the table lists every Data Partner the suite has seeded.
const rowFor = async (orgName: string) => {
    await waitFor(() => expect(screen.getByText(orgName)).toBeDefined())
    const row = screen.getByText(orgName).closest('tr')
    if (!row) throw new Error(`no table row for ${orgName}`)
    return row
}

// Mantine's FileInput hides the real input behind a button, so the file goes in directly.
const chooseFile = (name: string) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['pdf bytes'], name, { type: 'application/pdf' })] } })
}

describe('ParticipationAgreements', () => {
    it('lists an org with no agreement and offers to upload one', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await seedDataPartner()

        renderWithProviders(<ParticipationAgreements type="dopa" />)

        const row = await rowFor(org.name)
        expect(within(row).getByRole('button', { name: 'Upload' })).toBeDefined()
        // Nothing to link to or show history for until something is published.
        expect(within(row).queryByRole('link', { name: 'View PDF' })).toBeNull()
    })

    it('shows a published agreement with the signed date as it was stored', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await seedSignedDopa('2026-07-27')

        renderWithProviders(<ParticipationAgreements type="dopa" />)

        const row = await rowFor(org.name)
        // Guards the off-by-one: the day entered must be the day rendered.
        expect(within(row).getByText('2026-07-27')).toBeDefined()
        expect(within(row).getByText('1')).toBeDefined()
        expect(within(row).getByRole('link', { name: 'View PDF' })).toBeDefined()
        expect(within(row).getByRole('button', { name: 'Upload new version' })).toBeDefined()
    })

    it('fixes the org on the upload form and holds Publish until a date and file are given', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await seedDataPartner()

        renderWithProviders(<ParticipationAgreements type="dopa" />)

        const row = await rowFor(org.name)
        fireEvent.click(within(row).getByRole('button', { name: 'Upload' }))

        await waitFor(() => expect(screen.getByText('Upload a signed Data Partner Participation Agreement')))
        // The org came from the row, so there is nothing to select.
        expect(screen.queryByRole('textbox', { name: 'Data Partner' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-dopa.pdf')

        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).not.toBeDisabled())
    })

    it('repeats the org, date and file in the publish confirmation', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await seedDataPartner()

        renderWithProviders(<ParticipationAgreements type="dopa" />)

        const row = await rowFor(org.name)
        fireEvent.click(within(row).getByRole('button', { name: 'Upload' }))
        await waitFor(() => expect(screen.getByLabelText('Signed on')).toBeDefined())
        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-dopa.pdf')

        fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))

        // Both modals are open at once, so the assertions are scoped to the confirmation.
        const confirmation = await waitFor(() => {
            const dialog = screen.getAllByRole('dialog').find((el) => within(el).queryByText('Publish this file?'))
            if (!dialog) throw new Error('confirmation modal did not open')
            return dialog
        })

        expect(within(confirmation).getByText(org.name)).toBeDefined()
        expect(within(confirmation).getByText('2026-08-03')).toBeDefined()
        expect(within(confirmation).getByText('signed-dopa.pdf')).toBeDefined()
    })

    it('opens the version history for an org that has published one', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await seedSignedDopa('2026-07-27')

        renderWithProviders(<ParticipationAgreements type="dopa" />)

        const row = await rowFor(org.name)
        fireEvent.click(within(row).getByRole('button', { name: 'Version History' }))

        const history = await waitFor(() => {
            const dialog = screen.getAllByRole('dialog').find((el) => within(el).queryByText('Published by'))
            if (!dialog) throw new Error('version history did not open')
            return dialog
        })

        expect(within(history).getByText('2026-07-27')).toBeDefined()
    })

    it('lists Research Labs rather than Data Partners for a ropa', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const dataPartner = await seedDataPartner()
        const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })

        renderWithProviders(<ParticipationAgreements type="ropa" />)

        await waitFor(() => expect(screen.getByText(researchLab.name)).toBeDefined())
        expect(screen.queryByText(dataPartner.name)).toBeNull()
    })
})
