import { useParams } from 'next/navigation'
import { type Mock, describe, expect, it, vi } from 'vitest'
import { HocuspocusProvider } from '@hocuspocus/provider'
import {
    advanceTimers,
    afterEach,
    fakeTimeouts,
    fireEvent,
    mockClerkSession,
    renderWithProviders,
    restoreRealTimers,
    screen,
    waitFor,
    waitForPendingMutations,
} from '@/tests/unit.helpers'
import { EditCodeResubmitProvider, useEditCodeResubmit } from './context'
import { resubmitStudyCodeAction, saveCodeResubmissionNoteDraftAction } from '@/server/actions/study-code.actions'

vi.mock('@/server/actions/study-code.actions', () => ({
    resubmitStudyCodeAction: vi.fn(),
    saveCodeResubmissionNoteDraftAction: vi.fn(),
}))

const mutationErrorHandler = vi.fn()
vi.mock('@/components/errors', () => ({
    reportMutationError: vi.fn(() => mutationErrorHandler),
}))

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function Harness({ onSaveResult }: { onSaveResult: (result: boolean) => void }) {
    const { noteForm, saveDraft, resubmit } = useEditCodeResubmit()

    return (
        <>
            <button type="button" onClick={() => resubmit({ mainFileName: 'main.r', fileNames: ['main.r'] })}>
                Resubmit
            </button>
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
    afterEach(restoreRealTimers)

    // A Server Action posts to whatever route is current, so an autosave in flight across a
    // navigation rejects; reporting it would toast on a page the researcher already left.
    it('does not report an autosave that rejects after the provider unmounts', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        mutationErrorHandler.mockClear()

        const saveDraftAction = vi.mocked(saveCodeResubmissionNoteDraftAction)
        // Stays pending so the save is genuinely in flight across the unmount.
        let rejectSave: (error: Error) => void = () => {}
        saveDraftAction.mockImplementation(
            () =>
                new Promise((_resolve, reject) => {
                    rejectSave = reject
                }) as ReturnType<typeof saveCodeResubmissionNoteDraftAction>,
        )

        const onSaveResult = vi.fn()

        fakeTimeouts()
        const { unmount } = renderWithProviders(
            <EditCodeResubmitProvider studyId={STUDY_ID} orgName="Test Org" initialNote="">
                <Harness onSaveResult={onSaveResult} />
            </EditCodeResubmitProvider>,
        )

        const note = 'typed right before navigating away'
        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: note } })
        // Jumps the 800 ms autosave debounce rather than waiting it out in real time.
        await advanceTimers(800)
        expect(saveDraftAction).toHaveBeenCalled()

        unmount()
        rejectSave(new Error('An unexpected response was received from the server.'))
        await waitForPendingMutations()

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
            <EditCodeResubmitProvider studyId={STUDY_ID} orgName="Test Org" initialNote="">
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

    // OTTER-753: the second researcher is only kicked out if this page actually broadcasts.
    it('broadcasts code-submitted from the code room after a successful resubmit', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        mockClerkSession({ clerkUserId: 'user_erin', userId: STUDY_ID, orgSlug: 'lab-1', firstName: 'Erin' })
        vi.mocked(resubmitStudyCodeAction).mockResolvedValue({ studyId: STUDY_ID } as never)

        renderWithProviders(
            <EditCodeResubmitProvider studyId={STUDY_ID} orgName="Test Org" initialNote="fixed the loop">
                <Harness onSaveResult={vi.fn()} />
            </EditCodeResubmitProvider>,
        )
        const { __instances } = HocuspocusProvider as unknown as { __instances: { sendStateless: Mock }[] }
        await waitFor(() => expect(__instances).toHaveLength(1))

        fireEvent.click(screen.getByRole('button', { name: 'Resubmit' }))

        await waitFor(() => expect(__instances[0].sendStateless).toHaveBeenCalledTimes(1))
        expect(JSON.parse(__instances[0].sendStateless.mock.calls[0][0] as string)).toMatchObject({
            type: 'code-submitted',
            studyId: STUDY_ID,
        })
    })
})
