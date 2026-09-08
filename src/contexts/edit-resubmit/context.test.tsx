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

const mutationErrorHandler = vi.fn()
vi.mock('@/components/errors', () => ({
    reportMutationError: vi.fn(() => mutationErrorHandler),
}))

// The debounced autosave only runs in single-user mode, so force it on for the path under test.
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
    // OTTER-558: without the retry guard a failed save marks the value "saved", so the next click
    // is a no-op and the note is silently dropped.
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

        const noteCalls = saveNoteAction.mock.calls.filter((args) => args[0]?.note === note)
        expect(noteCalls.length).toBeGreaterThanOrEqual(2)
        expect(saveNoteAction).toHaveBeenCalledWith({ studyId: STUDY_ID, note })
    })

    // A Server Action posts to whatever route is current, so an autosave in flight across a
    // navigation resolves against the new route and the client throws.
    it('does not report an autosave that rejects after the provider unmounts', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })

        const saveNoteAction = vi.mocked(saveProposalResubmissionNoteDraftAction)
        // Stays pending so the save is genuinely in flight across the unmount.
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

        await waitFor(() => expect(saveNoteAction).toHaveBeenCalled())
        unmount()

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

    // OTTER-690: unlike the DRAFT page, this flow still renders an editable collaborative title, so
    // reusing the DRAFT resolver here would let a titleless resubmission reach submit.
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

// Forces the mock shape to match the real module.
void resubmitProposalAction
