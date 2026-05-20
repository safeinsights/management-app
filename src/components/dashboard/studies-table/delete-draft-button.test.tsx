import { describe, expect, it, vi } from 'vitest'
import { notifications } from '@mantine/notifications'
import { db, createTestProposalDraft, renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { DeleteDraftButton } from './delete-draft-button'
import { StudyRow } from './types'

function makeStudyRow(overrides: Partial<StudyRow> & { id: string; researcherId: string }): StudyRow {
    return {
        title: 'My Draft',
        status: 'DRAFT',
        createdAt: new Date(),
        submittedAt: null,
        reviewerId: null,
        createdBy: null,
        jobStatusChanges: [],
        ...overrides,
    } as StudyRow
}

describe('DeleteDraftButton', () => {
    it('opens the confirmation modal with the spec title, body, and buttons when the trash icon is clicked', async () => {
        const { studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'delete-draft-modal-enclave',
            studyInfo: { title: 'Modal Draft' },
        })
        const user1 = userEvent.setup()

        renderWithProviders(
            <DeleteDraftButton study={makeStudyRow({ id: studyId, researcherId: user.id, title: 'Modal Draft' })} />,
        )

        await user1.click(screen.getByLabelText(/delete draft study/i))

        expect(await screen.findByText('Confirm proposal draft deletion?')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Please confirm that you are wanting to delete this proposal draft. Once this draft is deleted you will not be able to recover it. This action cannot be undone.',
            ),
        ).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /yes, delete proposal draft/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
    })

    it('renders the delete confirm button with a red.9 background', async () => {
        const { studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'delete-draft-red-color-enclave',
            studyInfo: { title: 'Red Draft' },
        })
        const user1 = userEvent.setup()

        renderWithProviders(
            <DeleteDraftButton study={makeStudyRow({ id: studyId, researcherId: user.id, title: 'Red Draft' })} />,
        )

        await user1.click(screen.getByLabelText(/delete draft study/i))
        const confirm = await screen.findByRole('button', { name: /yes, delete proposal draft/i })

        // Mantine v7 maps `color="red.9"` to an inline CSS variable on the button.
        // Asserting on the variable rather than the resolved color keeps the test
        // resilient to theme changes while pinning the red.9 contract from the spec.
        expect(confirm.getAttribute('style') || '').toContain('--button-bg: var(--mantine-color-red-9)')
    })

    it('closes the modal when the header X close button is clicked', async () => {
        const { studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'delete-draft-xclose-enclave',
            studyInfo: { title: 'X Draft' },
        })
        const user1 = userEvent.setup()

        renderWithProviders(
            <DeleteDraftButton study={makeStudyRow({ id: studyId, researcherId: user.id, title: 'X Draft' })} />,
        )

        await user1.click(screen.getByLabelText(/delete draft study/i))
        await screen.findByText('Confirm proposal draft deletion?')

        // Mantine's Modal close button uses aria-label="Close" by default
        await user1.click(screen.getByRole('button', { name: /^close$/i }))

        await waitFor(() => {
            expect(screen.queryByText('Confirm proposal draft deletion?')).not.toBeInTheDocument()
        })

        const row = await db.selectFrom('study').select('deletedAt').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(row.deletedAt).toBeNull()
    })

    it('closes the modal without deleting when Cancel is clicked', async () => {
        const { studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'delete-draft-cancel-enclave',
            studyInfo: { title: 'Cancel Draft' },
        })
        const user1 = userEvent.setup()

        renderWithProviders(
            <DeleteDraftButton study={makeStudyRow({ id: studyId, researcherId: user.id, title: 'Cancel Draft' })} />,
        )

        await user1.click(screen.getByLabelText(/delete draft study/i))
        await user1.click(await screen.findByRole('button', { name: /^cancel$/i }))

        await waitFor(() => {
            expect(screen.queryByText('Confirm proposal draft deletion?')).not.toBeInTheDocument()
        })

        const row = await db.selectFrom('study').select('deletedAt').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(row.deletedAt).toBeNull()
    })

    it('soft-deletes the study and shows a success toast on confirm', async () => {
        const { studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'delete-draft-confirm-enclave',
            studyInfo: { title: 'Doomed' },
        })
        const user1 = userEvent.setup()

        renderWithProviders(
            <DeleteDraftButton study={makeStudyRow({ id: studyId, researcherId: user.id, title: 'Doomed' })} />,
        )

        await user1.click(screen.getByLabelText(/delete draft study/i))
        await user1.click(await screen.findByRole('button', { name: /yes, delete proposal draft/i }))

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    color: 'green',
                    message: 'Proposal draft Doomed was successfully deleted',
                }),
            )
        })

        const row = await db.selectFrom('study').select('deletedAt').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(row.deletedAt).not.toBeNull()
    })

    it('uses the same "Untitled Draft" fallback in both the aria-label and the success toast when title is null', async () => {
        const { studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'delete-draft-untitled-enclave',
            studyInfo: { title: 'Has a title' }, // createTestProposalDraft requires a title; we null it below
        })
        await db.updateTable('study').set({ title: null }).where('id', '=', studyId).execute()

        const user1 = userEvent.setup()
        renderWithProviders(
            <DeleteDraftButton
                study={makeStudyRow({ id: studyId, researcherId: user.id, title: null as unknown as string })}
            />,
        )

        // aria-label uses the fallback
        expect(screen.getByLabelText('Delete draft study Untitled Draft')).toBeInTheDocument()

        await user1.click(screen.getByLabelText('Delete draft study Untitled Draft'))
        await user1.click(await screen.findByRole('button', { name: /yes, delete proposal draft/i }))

        // success toast uses the same fallback
        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    color: 'green',
                    message: 'Proposal draft Untitled Draft was successfully deleted',
                }),
            )
        })
    })

    it('shows an error toast when the action fails', async () => {
        const { studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'delete-draft-error-enclave',
            studyInfo: { title: 'Already Submitted' },
        })
        // Flip status to a non-draft state so the server action rejects with ActionFailure
        await db.updateTable('study').set({ status: 'PENDING-REVIEW' }).where('id', '=', studyId).execute()

        const user1 = userEvent.setup()
        renderWithProviders(
            <DeleteDraftButton
                study={makeStudyRow({ id: studyId, researcherId: user.id, title: 'Already Submitted' })}
            />,
        )

        await user1.click(screen.getByLabelText(/delete draft study/i))
        await user1.click(await screen.findByRole('button', { name: /yes, delete proposal draft/i }))

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({ color: 'red', title: 'Failed to delete proposal draft' }),
            )
        })

        // ensure success toast was not also fired
        const calls = (notifications.show as unknown as ReturnType<typeof vi.fn>).mock.calls
        expect(calls.some(([arg]) => arg?.color === 'green')).toBe(false)
    })
})
