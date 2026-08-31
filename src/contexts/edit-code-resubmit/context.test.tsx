import { useParams } from 'next/navigation'
import { type Mock, describe, expect, it, vi } from 'vitest'
import { fireEvent, renderWithProviders, screen, waitFor } from '@/tests/unit.helpers'
import { EditCodeResubmitProvider, useEditCodeResubmit } from './context'
import { saveCodeResubmissionNoteDraftAction } from '@/server/actions/study-request'

vi.mock('@/server/actions/study-request', () => ({
    resubmitStudyCodeAction: vi.fn(),
    saveCodeResubmissionNoteDraftAction: vi.fn(),
}))

// The provider passes reportMutationError's returned handler to useMutation's onError, so asserting
// on the returned handler is what tells us whether a failure was surfaced to the researcher.
const mutationErrorHandler = vi.fn()
vi.mock('@/components/errors', () => ({
    reportMutationError: vi.fn(() => mutationErrorHandler),
}))

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function Harness({ onSaveResult }: { onSaveResult: (result: boolean) => void }) {
    const { noteForm, saveDraft } = useEditCodeResubmit()

    return (
        <>
            <textarea
                aria-label="Resubmission note"
                value={noteForm.values.resubmissionNote}
                onChange={(event) => noteForm.setFieldValue('resubmissionNote', event.currentTarget.value)}
            />
            <button type="button" onClick={async () => onSaveResult(await saveDraft())}>
                Save
            </button>
        </>
    )
}

describe('EditCodeResubmitProvider', () => {
    // A Server Action posts to whatever route is current when the request goes out, so an autosave
    // already in flight when the researcher navigates away resolves against the NEW route, which
    // has no matching action. Next returns a non-RSC 200 and the client throws "An unexpected
    // response was received from the server." — an "Unable to save resubmission note draft" toast
    // on a page the researcher already left.
    it('does not report an autosave that rejects after the provider unmounts', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        mutationErrorHandler.mockClear()

        const saveDraftAction = vi.mocked(saveCodeResubmissionNoteDraftAction)
        // Stays pending until we reject it, so the save is genuinely in flight across the unmount.
        let rejectSave: (error: Error) => void = () => {}
        saveDraftAction.mockImplementation(
            () =>
                new Promise((_resolve, reject) => {
                    rejectSave = reject
                }) as ReturnType<typeof saveCodeResubmissionNoteDraftAction>,
        )

        const onSaveResult = vi.fn()

        const { unmount } = renderWithProviders(
            <EditCodeResubmitProvider studyId={STUDY_ID} initialNote="">
                <Harness onSaveResult={onSaveResult} />
            </EditCodeResubmitProvider>,
        )

        const note = 'typed right before navigating away'
        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: note } })
        await waitFor(() => expect(saveDraftAction).toHaveBeenCalled())

        unmount()
        rejectSave(new Error('An unexpected response was received from the server.'))
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(mutationErrorHandler).not.toHaveBeenCalled()
    })

    it('retries the same note after a save failure instead of marking it saved', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        const saveDraftAction = vi.mocked(saveCodeResubmissionNoteDraftAction)
        saveDraftAction
            .mockResolvedValueOnce({ error: 'temporary failure' })
            .mockResolvedValueOnce({ studyId: STUDY_ID, savedAt: new Date().toISOString() })
        const onSaveResult = vi.fn()

        renderWithProviders(
            <EditCodeResubmitProvider studyId={STUDY_ID} initialNote="">
                <Harness onSaveResult={onSaveResult} />
            </EditCodeResubmitProvider>,
        )

        const note = 'same failed draft note'
        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: note } })
        await waitFor(() => expect(screen.getByLabelText('Resubmission note')).toHaveValue(note))

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaveResult).toHaveBeenCalledWith(false))

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaveResult).toHaveBeenCalledWith(true))

        expect(saveDraftAction).toHaveBeenCalledTimes(2)
        expect(saveDraftAction).toHaveBeenNthCalledWith(1, { studyId: STUDY_ID, note })
        expect(saveDraftAction).toHaveBeenNthCalledWith(2, { studyId: STUDY_ID, note })
    })
})
