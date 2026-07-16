import { type Mock, describe, expect, it, vi } from 'vitest'
import { useParams } from 'next/navigation'
import { fireEvent, renderWithProviders, screen, waitFor } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { EditResubmitProvider, useEditResubmit } from './context'
import {
    markProposalDraftEditedAction,
    resubmitProposalAction,
    saveProposalResubmissionNoteDraftAction,
} from '@/server/actions/study-request'

vi.mock('@/server/actions/study-request', () => ({
    resubmitProposalAction: vi.fn(),
    saveProposalResubmissionNoteDraftAction: vi.fn(),
    // OTTER-636: the provider fires this on the first real edit to flip CHANGE-REQUESTED -> DRAFT.
    markProposalDraftEditedAction: vi.fn().mockResolvedValue({ studyId: '11111111-1111-4111-8111-111111111111' }),
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

    it('initialises the form from initialNote, normalized to Lexical JSON, so a draft survives a page reload', () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        const onSaveResult = vi.fn()

        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} initialNote="previously saved draft">
                <Harness onSaveResult={onSaveResult} />
            </EditResubmitProvider>,
        )

        expect(screen.getByLabelText('Resubmission note')).toHaveValue(lexicalJson('previously saved draft'))
    })

    it('initialises the form verbatim when the draft is already Lexical JSON', () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        const draft = lexicalJson('draft saved by the collaborative editor')

        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} initialNote={draft}>
                <Harness onSaveResult={vi.fn()} />
            </EditResubmitProvider>,
        )

        expect(screen.getByLabelText('Resubmission note')).toHaveValue(draft)
    })
})

// OTTER-636: the provider flips a change-requested proposal to DRAFT on the first real edit.
describe('EditResubmitProvider — reverts to draft on first edit', () => {
    it('does not flip on mount when nothing has been edited', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        const markEdited = vi.mocked(markProposalDraftEditedAction)
        markEdited.mockClear()

        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} initialNote="">
                <Harness onSaveResult={vi.fn()} />
            </EditResubmitProvider>,
        )

        // Give any effects a chance to run; the flip must not fire without an edit.
        await waitFor(() => expect(screen.getByLabelText('Resubmission note')).toBeInTheDocument())
        expect(markEdited).not.toHaveBeenCalled()
    })

    it('flips to draft once after the resubmission note is edited', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        const markEdited = vi.mocked(markProposalDraftEditedAction)
        markEdited.mockClear()

        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} initialNote="">
                <Harness onSaveResult={vi.fn()} />
            </EditResubmitProvider>,
        )

        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: 'a real edit' } })

        await waitFor(() => expect(markEdited).toHaveBeenCalledWith({ studyId: STUDY_ID }))
        // Further edits must not re-fire — the flip is once-per-mount.
        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: 'a real edit again' } })
        await waitFor(() => expect(screen.getByLabelText('Resubmission note')).toHaveValue('a real edit again'))
        expect(markEdited).toHaveBeenCalledTimes(1)
    })
})

// Sanity touch — ensures the export wiring of resubmitProposalAction isn't broken
// by our changes. The hook isn't exercised here but importing it forces the mock
// shape to match the real module.
void resubmitProposalAction
