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
    it('opens the confirmation modal when the trash icon is clicked', async () => {
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
        expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /yes, delete proposal draft/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
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
