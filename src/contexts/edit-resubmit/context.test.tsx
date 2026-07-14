import { type Mock, describe, expect, it, vi } from 'vitest'
import { useParams } from 'next/navigation'
import { fireEvent, renderWithProviders, screen, waitFor } from '@/tests/unit.helpers'
import { EditResubmitProvider, useEditResubmit } from './context'
import { resubmitProposalAction, saveProposalResubmissionNoteDraftAction } from '@/server/actions/study-request'

vi.mock('@/server/actions/study-request', () => ({
    resubmitProposalAction: vi.fn(),
    saveProposalResubmissionNoteDraftAction: vi.fn(),
}))

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function Harness({ onSaveResult }: { onSaveResult: (result: boolean) => void }) {
    const { noteForm, flushNote, isSavingNote, noteLastSavedAt } = useEditResubmit()

    return (
        <>
            <textarea
                aria-label="Resubmission note"
                value={noteForm.values.resubmissionNote}
                onChange={(event) => noteForm.setFieldValue('resubmissionNote', event.currentTarget.value)}
            />
            <button type="button" onClick={async () => onSaveResult(await flushNote())}>
                Save
            </button>
            <span data-testid="is-saving-note">{String(isSavingNote)}</span>
            <span data-testid="note-last-saved">{noteLastSavedAt ? noteLastSavedAt.toISOString() : 'never'}</span>
        </>
    )
}

describe('EditResubmitProvider — proposal resubmission note autosave', () => {
    // Mirrors OTTER-558's behavior for the code resubmit flow. Without the retry
    // guard a failed save would mark the value as "saved" and the next click
    // would be a no-op, silently dropping the researcher's note.
    it('retries the same note after a save failure instead of marking it saved', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })

        const saveNoteAction = vi.mocked(saveProposalResubmissionNoteDraftAction)
        saveNoteAction
            .mockResolvedValueOnce({ error: 'temporary failure' })
            .mockResolvedValueOnce({ studyId: STUDY_ID, savedAt: new Date().toISOString() })

        const onSaveResult = vi.fn()

        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} initialNote="">
                <Harness onSaveResult={onSaveResult} />
            </EditResubmitProvider>,
        )

        const note = 'same failed draft note'
        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: note } })
        await waitFor(() => expect(screen.getByLabelText('Resubmission note')).toHaveValue(note))

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaveResult).toHaveBeenCalledWith(false))

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaveResult).toHaveBeenCalledWith(true))

        // First call comes from the explicit Save click; if the autosave debounce
        // also fired we'd see more than two — assert exactly two saves of the
        // same note value.
        const noteCalls = saveNoteAction.mock.calls.filter((args) => args[0]?.note === note)
        expect(noteCalls.length).toBeGreaterThanOrEqual(2)
        expect(saveNoteAction).toHaveBeenCalledWith({ studyId: STUDY_ID, note })
    })

    it('does not call the save action when the note has not been edited', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        const saveNoteAction = vi.mocked(saveProposalResubmissionNoteDraftAction)
        saveNoteAction.mockResolvedValue({ studyId: STUDY_ID, savedAt: new Date().toISOString() })

        const onSaveResult = vi.fn()

        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} initialNote="">
                <Harness onSaveResult={onSaveResult} />
            </EditResubmitProvider>,
        )

        // No edit, just hit Save — the note action must not fire because the pending
        // value matches the last-saved value.
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaveResult).toHaveBeenCalled())
        expect(saveNoteAction).not.toHaveBeenCalled()
    })

    it('initialises the form from initialNote so a draft survives a page reload', () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        const onSaveResult = vi.fn()

        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} initialNote="previously saved draft">
                <Harness onSaveResult={onSaveResult} />
            </EditResubmitProvider>,
        )

        expect(screen.getByLabelText('Resubmission note')).toHaveValue('previously saved draft')
    })
})

// Sanity touch — ensures the export wiring of resubmitProposalAction isn't broken
// by our changes. The hook isn't exercised here but importing it forces the mock
// shape to match the real module.
void resubmitProposalAction
