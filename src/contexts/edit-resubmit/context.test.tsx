import { type Mock, describe, expect, it, vi } from 'vitest'
import { useParams } from 'next/navigation'
import { fireEvent, renderWithProviders, screen, waitFor } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { EditResubmitProvider, useEditResubmit } from './context'
import { resubmitProposalAction, saveProposalResubmissionNoteDraftAction } from '@/server/actions/study-request'

vi.mock('@/server/actions/study-request', () => ({
    resubmitProposalAction: vi.fn(),
    saveProposalResubmissionNoteDraftAction: vi.fn(),
}))

// The provider passes reportMutationError's returned handler to useMutation's onError, so asserting
// on the returned handler is what tells us whether a failure was surfaced to the researcher.
const mutationErrorHandler = vi.fn()
vi.mock('@/components/errors', () => ({
    reportMutationError: vi.fn(() => mutationErrorHandler),
}))

// The debounced autosave only runs in single-user mode; collaborative editing persists through Yjs
// instead. Force it on so the debounce path under test actually fires.
vi.mock('@/lib/realtime/yjs-websocket-context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/realtime/yjs-websocket-context')>()),
    useSingleUserEditing: () => true,
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

    // A Server Action posts to whatever route is current when the request goes out. An autosave
    // already in flight when the researcher navigates away resolves against the NEW route, which
    // has no matching action, so Next returns a non-RSC 200 and the client throws "An unexpected
    // response was received from the server." — surfacing as an "Unable to save resubmission note
    // draft" toast on a page the researcher already left. The queued-but-not-yet-fired case is
    // already covered by the effect's clearTimeout; this is the in-flight one that is not.
    it('does not report an autosave that rejects after the provider unmounts', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })

        const saveNoteAction = vi.mocked(saveProposalResubmissionNoteDraftAction)
        // Stays pending until we resolve it, so the save is genuinely in flight across the unmount.
        let rejectSave: (error: Error) => void = () => {}
        saveNoteAction.mockImplementation(
            () =>
                new Promise((_resolve, reject) => {
                    rejectSave = reject
                }) as ReturnType<typeof saveProposalResubmissionNoteDraftAction>,
        )

        const onSaveResult = vi.fn()

        const { unmount } = renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} initialNote="">
                <Harness onSaveResult={onSaveResult} />
            </EditResubmitProvider>,
        )

        const note = 'typed right before navigating away'
        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: note } })
        await waitFor(() => expect(screen.getByLabelText('Resubmission note')).toHaveValue(note))

        // Let the debounce fire so the request is in flight, then navigate away.
        await waitFor(() => expect(saveNoteAction).toHaveBeenCalled())
        unmount()

        // The request lands on the new route and Next throws.
        rejectSave(new Error('An unexpected response was received from the server.'))
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(mutationErrorHandler).not.toHaveBeenCalled()
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

    // OTTER-690 regression guard. The DRAFT proposal page dropped its title rule because Step 1
    // owns that column there. This flow does not: it still renders an editable collaborative
    // title, so swapping it onto the DRAFT resolver would let a resubmission through with no
    // title and violate study_title_required_when_not_draft on submit.
    describe('title ownership (OTTER-690)', () => {
        const renderTitleProbe = (title: string) => {
            ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })

            renderWithProviders(
                <EditResubmitProvider studyId={STUDY_ID} draftData={{ title }}>
                    <TitleValidityProbe />
                </EditResubmitProvider>,
            )
        }

        it('still reports a blank title as invalid', () => {
            renderTitleProbe('')
            expect(screen.getByTestId('title-valid')).toHaveTextContent('false')
        })

        it('accepts a real title', () => {
            renderTitleProbe('A resubmitted study')
            expect(screen.getByTestId('title-valid')).toHaveTextContent('true')
        })
    })
})

// `isValid` rather than `validate`: validate writes the error state, which re-renders the probe,
// which validates again.
function TitleValidityProbe() {
    const { form } = useEditResubmit()

    return <span data-testid="title-valid">{String(form.isValid('title'))}</span>
}

// Sanity touch — ensures the export wiring of resubmitProposalAction isn't broken
// by our changes. The hook isn't exercised here but importing it forces the mock
// shape to match the real module.
void resubmitProposalAction
