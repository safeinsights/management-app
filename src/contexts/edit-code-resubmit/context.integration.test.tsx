// Unmocked against the test DB: the sibling context.test.tsx mocks the action, so it never
// exercises the real eligibility gate the OTTER-558 bug slipped through.
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
import { notifications } from '@mantine/notifications'
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

function ResubmitHarness() {
    const { resubmit } = useEditCodeResubmit()
    return (
        <button type="button" onClick={() => resubmit({ mainFileName: 'main.R', fileNames: ['main.R'] })}>
            Resubmit
        </button>
    )
}

const jobCount = async (studyId: string) =>
    Number(
        (
            await db
                .selectFrom('studyJob')
                .select((eb) => eb.fn.countAll().as('n'))
                .where('studyId', '=', studyId)
                .executeTakeFirstOrThrow()
        ).n,
    )

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

    // The wrapped useMutation unwraps the refusal, so a bare mutationFn is enough; pinned because
    // reaching for actionResult here would flatten it and toast "Try again" instead.
    it('reports the refusal rather than a resubmission when the study agreement is unacknowledged', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-CHANGES-REQUESTED',
            withStudyAgreement: false,
        })

        renderWithProviders(
            <EditCodeResubmitProvider studyId={study.id} initialNote="the reviewer asked for a change">
                <ResubmitHarness />
            </EditCodeResubmitProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Resubmit' }))

        await waitFor(() =>
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    color: 'red',
                    title: 'Unable to resubmit study code',
                    message: expect.stringContaining('Study Agreement has not been signed yet for this study'),
                }),
            ),
        )
        expect(notifications.show).not.toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Study Code Resubmitted' }),
        )
        expect(await jobCount(study.id)).toBe(1)
    })
})
