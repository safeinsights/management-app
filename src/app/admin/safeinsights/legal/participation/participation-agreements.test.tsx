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

// Scoped to one org's row: the table lists every agreement the suite has seeded.
const rowFor = async (orgName: string) => {
    await waitFor(() => expect(screen.getByText(orgName)).toBeDefined())
    const row = screen.getByText(orgName).closest('tr')
    if (!row) throw new Error(`no table row for ${orgName}`)
    return row
}

// The dropzone keeps a real file input behind it, so the file goes in directly.
const chooseFile = (name: string) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['pdf bytes'], name, { type: 'application/pdf' })] } })
}

const confirmation = () =>
    waitFor(() => {
        const dialog = screen.getAllByRole('dialog').find((el) => within(el).queryByText('Publish this file?'))
        if (!dialog) throw new Error('confirmation modal did not open')
        return dialog
    })

describe('ParticipationAgreements', () => {
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

    it('leaves an org out of the table until it has an agreement', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const signed = await seedSignedDopa('2026-07-27')
        const unsigned = await seedDataPartner()

        renderWithProviders(<ParticipationAgreements type="dopa" />)

        await rowFor(signed.name)
        expect(screen.queryByText(unsigned.name)).toBeNull()
    })

    it('picks the org on the upload form and holds Publish until all three are given', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await seedDataPartner()

        renderWithProviders(<ParticipationAgreements type="dopa" />)

        fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

        await waitFor(() =>
            expect(screen.getByText('Upload a signed Data Organization Participation Agreement')).toBeDefined(),
        )
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()

        // An org with no agreement yet is still offered: this is where its first one comes from.
        const select = screen.getByPlaceholderText('Select a Data Partner')
        fireEvent.click(select)
        fireEvent.click(await screen.findByRole('option', { name: org.name }))

        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-dopa.pdf')

        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).not.toBeDisabled())
    })

    it('offers an org that has already signed, so a renewal is a new version', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await seedSignedDopa('2026-07-27')

        renderWithProviders(<ParticipationAgreements type="dopa" />)

        await rowFor(org.name)
        fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

        fireEvent.click(await screen.findByPlaceholderText('Select a Data Partner'))
        fireEvent.click(await screen.findByRole('option', { name: org.name }))

        await waitFor(() => expect(screen.getByText(/This organization is on version 1\./)).toBeDefined())
    })

    it('names the org, date, file and the people being obligated in the confirmation', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await seedSignedDopa('2026-07-27')

        renderWithProviders(<ParticipationAgreements type="dopa" />)

        const row = await rowFor(org.name)
        fireEvent.click(within(row).getByRole('button', { name: 'Upload new version' }))

        await waitFor(() => expect(screen.getByLabelText('Signed on')).toBeDefined())
        // The org came from the row, so there is nothing to select.
        expect(screen.queryByPlaceholderText('Select a Data Partner')).toBeNull()

        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-dopa.pdf')
        fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))

        // Both modals are open at once, so the assertions are scoped to the confirmation.
        const dialog = await confirmation()

        expect(within(dialog).getAllByText(org.name).length).toBeGreaterThan(0)
        expect(within(dialog).getByText('2026-08-03')).toBeDefined()
        expect(within(dialog).getByText('signed-dopa.pdf')).toBeDefined()
        expect(within(dialog).getByText(/requires each of them to acknowledge it/)).toBeDefined()
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
        const dataPartner = await seedSignedDopa('2026-07-27')
        const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { version } = actionResult(
            await createLegalDocumentDraftAction({ type: 'ropa', orgId: researchLab.id, fileName: 'ropa.pdf' }),
        )
        actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt: '2026-07-27' }))

        renderWithProviders(<ParticipationAgreements type="ropa" />)

        await waitFor(() => expect(screen.getByText(researchLab.name)).toBeDefined())
        expect(screen.queryByText(dataPartner.name)).toBeNull()
    })
})
