import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
    actionResult,
    faker,
    insertTestOrg,
    mockSessionWithTestData,
    renderWithProviders,
    userEvent,
} from '@/tests/unit.helpers'
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
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

const seedDataPartner = () => insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })

const seedSignedDopa = async (signedAt: string) => {
    const org = await seedDataPartner()
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type: 'DOPA', orgId: org.id, fileName: 'dopa.pdf' }),
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

        renderWithProviders(<ParticipationAgreements type="DOPA" />)

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

        renderWithProviders(<ParticipationAgreements type="DOPA" />)

        await rowFor(signed.name)
        expect(screen.queryByText(unsigned.name)).toBeNull()
    })

    // Which orgs the picker offers is asserted against fetchParticipationSignatoriesAction; opening
    // the dropdown is left to the e2e spec, because Mantine's Combobox needs layout APIs happy-dom
    // does not provide and its options never render here.
    it('asks for an org when opened from the header, with Publish held until one is chosen', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const user = userEvent.setup()

        renderWithProviders(<ParticipationAgreements type="DOPA" />)

        await user.click(screen.getByRole('button', { name: 'Upload' }))

        await waitFor(() =>
            expect(screen.getByText('Upload a signed Data Organization Participation Agreement')).toBeDefined(),
        )
        expect(screen.getByPlaceholderText('Select a Data Partner')).toBeDefined()
        // A date and file alone are not enough while the org is still unset.
        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-dopa.pdf')

        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    })

    it('fixes the org and names its current version when opened from a row', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const user = userEvent.setup()
        const org = await seedSignedDopa('2026-07-27')

        renderWithProviders(<ParticipationAgreements type="DOPA" />)

        const row = await rowFor(org.name)
        await user.click(within(row).getByRole('button', { name: 'Upload new version' }))

        await waitFor(() => expect(screen.getByText(/This organization is on version 1\./)).toBeDefined())
        expect(screen.queryByPlaceholderText('Select a Data Partner')).toBeNull()

        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-dopa.pdf')

        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).not.toBeDisabled())
    })

    it('names the org, date and file in the confirmation, and promises no acknowledgement', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await seedSignedDopa('2026-07-27')

        renderWithProviders(<ParticipationAgreements type="DOPA" />)

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
        expect(within(dialog).getByText(/becomes the current Data Organization Participation Agreement/)).toBeDefined()
        // Nothing enforces a ropa/dopa yet, so the confirmation must not say anyone will be asked.
        expect(within(dialog).queryByText(/acknowledge/i)).toBeNull()
    })

    it('opens the version history for an org that has published one', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const org = await seedSignedDopa('2026-07-27')

        renderWithProviders(<ParticipationAgreements type="DOPA" />)

        const row = await rowFor(org.name)
        fireEvent.click(within(row).getByRole('button', { name: 'Version History' }))

        const history = await waitFor(() => {
            const dialog = screen.getAllByRole('dialog').find((el) => within(el).queryByText('Published by'))
            if (!dialog) throw new Error('version history did not open')
            return dialog
        })

        // findByText, not getByText: the table header renders before the versions arrive, so the
        // dialog is on screen while it is still fetching.
        expect(await within(history).findByText('2026-07-27')).toBeDefined()
    })

    it('lists Research Labs rather than Data Partners for a ropa', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const dataPartner = await seedSignedDopa('2026-07-27')
        const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { version } = actionResult(
            await createLegalDocumentDraftAction({ type: 'ROPA', orgId: researchLab.id, fileName: 'ropa.pdf' }),
        )
        actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt: '2026-07-27' }))

        renderWithProviders(<ParticipationAgreements type="ROPA" />)

        await waitFor(() => expect(screen.getByText(researchLab.name)).toBeDefined())
        expect(screen.queryByText(dataPartner.name)).toBeNull()
    })
})
