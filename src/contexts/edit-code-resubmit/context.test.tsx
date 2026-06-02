import { useParams } from 'next/navigation'
import { type Mock, describe, expect, it, vi } from 'vitest'
import { fireEvent, renderWithProviders, screen, waitFor } from '@/tests/unit.helpers'
import { EditCodeResubmitProvider, useEditCodeResubmit } from './context'
import { saveCodeResubmissionNoteDraftAction } from '@/server/actions/study-request'

vi.mock('@/server/actions/study-request', () => ({
    resubmitStudyCodeAction: vi.fn(),
    saveCodeResubmissionNoteDraftAction: vi.fn(),
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
