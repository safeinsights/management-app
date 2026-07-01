// Integration coverage for the autosave path with NO action mocking — the real
// saveCodeResubmissionNoteDraftAction runs against the test DB. This is the layer the
// OTTER-558 save bug slipped through: the sibling context.test.tsx mocks the action (to
// inject a transient failure for the retry test), so it never exercised the real eligibility
// gate. Here the provider, the debounced autosave, the server action, and the DB all run for
// real, so a regression in the gate (or in how the client reports save success) fails loudly.
import { describe, expect, it } from 'vitest'
import {
    db,
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { EditCodeResubmitProvider, useEditCodeResubmit } from './context'

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

const readDraft = async (studyId: string) =>
    (
        await db
            .selectFrom('study')
            .select('codeResubmissionNoteDraft')
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow()
    ).codeResubmissionNoteDraft

describe('EditCodeResubmitProvider (real action + DB)', () => {
    it('persists the note to the DB for a resubmittable study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-CHANGES-REQUESTED',
        })

        const results: boolean[] = []
        renderWithProviders(
            <EditCodeResubmitProvider studyId={study.id} initialNote="">
                <Harness onSaveResult={(r) => results.push(r)} />
            </EditCodeResubmitProvider>,
        )

        const note = 'integration draft saved through the real action'
        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: note } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(results).toContain(true))
        expect(await readDraft(study.id)).toBe(note)
    })

    it('does not report saved and leaves the draft null when the study is not resubmittable', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'JOB-READY',
        })

        const results: boolean[] = []
        renderWithProviders(
            <EditCodeResubmitProvider studyId={study.id} initialNote="">
                <Harness onSaveResult={(r) => results.push(r)} />
            </EditCodeResubmitProvider>,
        )

        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: 'should not persist' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(results).toContain(false))
        expect(await readDraft(study.id)).toBeNull()
    })
})
