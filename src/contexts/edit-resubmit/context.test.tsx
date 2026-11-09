import { type Mock, describe, expect, it, vi } from 'vitest'
import { notifications } from '@mantine/notifications'
import { useParams } from 'next/navigation'
import {
    advanceTimers,
    afterEach,
    db,
    fakeTimeouts,
    fireEvent,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    restoreRealTimers,
    screen,
    setTestStudyStatus,
    waitFor,
    waitForPendingMutations,
} from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import type { StudyStatus } from '@/database/types'
import { EditResubmitProvider, useEditResubmit } from './context'
import { saveProposalResubmissionNoteDraftAction } from '@/server/actions/proposal-resubmission.actions'

// Real by default. A save that rejects after the provider unmounts is a transport failure no real
// action produces, so that test fails the call itself.
vi.mock('@/server/actions/proposal-resubmission.actions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/actions/proposal-resubmission.actions')>()
    return {
        ...actual,
        saveProposalResubmissionNoteDraftAction: vi.fn(actual.saveProposalResubmissionNoteDraftAction),
    }
})

// The debounced autosave only runs in single-user mode, so force it on for the path under test.
const SINGLE_USER = { singleUserEditing: true }

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

// A lab researcher's proposal; the note draft saves only while it is CHANGE-REQUESTED.
const setupProposal = async (status: StudyStatus) => {
    const { org: lab, user } = await mockSessionWithTestData({ orgType: 'lab' })
    const { study } = await insertTestStudyOnly({ submittedByOrg: lab, researcherId: user.id, status })
    ;(useParams as Mock).mockReturnValue({ orgSlug: lab.slug })
    return study
}

const noteDraftOf = async (studyId: string) => {
    const study = await db
        .selectFrom('study')
        .select('proposalResubmissionNoteDraft')
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow()
    return study.proposalResubmissionNoteDraft
}

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
    afterEach(restoreRealTimers)

    // OTTER-558: without the retry guard a failed save marks the value "saved", so the next click
    // is a no-op and the note is silently dropped.
    it('retries the same note after a save failure instead of marking it saved', async () => {
        // Refused until the reviewer has requested changes.
        const study = await setupProposal('PENDING-REVIEW')
        const onSaveResult = vi.fn()

        renderWithProviders(
            <EditResubmitProvider studyId={study.id} initialNote="">
                <Harness onSaveResult={onSaveResult} />
            </EditResubmitProvider>,
            SINGLE_USER,
        )

        const note = 'same failed draft note'
        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: note } })
        await waitFor(() => expect(screen.getByLabelText('Resubmission note')).toHaveValue(note))

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaveResult).toHaveBeenCalledWith(false))

        await setTestStudyStatus(study.id, 'CHANGE-REQUESTED')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaveResult).toHaveBeenCalledWith(true))

        expect(await noteDraftOf(study.id)).toBe(note)
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

        fakeTimeouts()
        const { unmount } = renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} initialNote="">
                <Harness onSaveResult={onSaveResult} />
            </EditResubmitProvider>,
            SINGLE_USER,
        )

        const note = 'typed right before navigating away'
        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: note } })
        await waitFor(() => expect(screen.getByLabelText('Resubmission note')).toHaveValue(note))

        // Jumps the 800 ms autosave debounce rather than waiting it out in real time.
        await advanceTimers(800)
        expect(saveNoteAction).toHaveBeenCalled()
        unmount()

        rejectSave(new Error('An unexpected response was received from the server.'))
        await waitForPendingMutations()

        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('does not call the save action when the note has not been edited', async () => {
        const study = await setupProposal('CHANGE-REQUESTED')
        const onSaveResult = vi.fn()

        renderWithProviders(
            <EditResubmitProvider studyId={study.id} initialNote="">
                <Harness onSaveResult={onSaveResult} />
            </EditResubmitProvider>,
            SINGLE_USER,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaveResult).toHaveBeenCalled())
        await waitForPendingMutations()
        expect(await noteDraftOf(study.id)).toBeNull()
    })

    it('initialises the form from initialNote, normalized to Lexical JSON, so a draft survives a page reload', () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
        const onSaveResult = vi.fn()

        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} initialNote="previously saved draft">
                <Harness onSaveResult={onSaveResult} />
            </EditResubmitProvider>,
            SINGLE_USER,
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
            SINGLE_USER,
        )

        expect(screen.getByLabelText('Resubmission note')).toHaveValue(draft)
    })

    // OTTER-762: the title field left this page, so requiring it would block Resubmit against a
    // field that is not on the page (OTTER-647).
    describe('title ownership (OTTER-762)', () => {
        const renderValidityProbe = (draftData: Partial<ProposalFormValues>) => {
            ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })

            renderWithProviders(
                <EditResubmitProvider studyId={STUDY_ID} draftData={draftData}>
                    <ValidityProbe />
                </EditResubmitProvider>,
                SINGLE_USER,
            )
        }

        it('no longer reports a blank title as invalid', () => {
            renderValidityProbe({ title: '' })
            expect(screen.getByTestId('title-valid')).toHaveTextContent('true')
        })

        it('still requires the fields the page does render, with the card wording', () => {
            renderValidityProbe({ datasets: [] })
            expect(screen.getByTestId('datasets-valid')).toHaveTextContent('false')
        })

        // A persisted NULL reaches the provider as `undefined`, which wins in an object spread and
        // would blank the matching initial value.
        it('falls back to the initial values when the draft carries undefined fields', () => {
            renderValidityProbe({ datasets: undefined, piName: undefined })
            expect(screen.getByTestId('datasets-valid')).toHaveTextContent('false')
            expect(screen.getByTestId('datasets-value')).toHaveTextContent('[]')
        })
    })
})

// `isValid` rather than `validate`: validate writes the error state, which re-renders the probe,
// which validates again.
function ValidityProbe() {
    const { form } = useEditResubmit()

    return (
        <>
            <span data-testid="title-valid">{String(form.isValid('title'))}</span>
            <span data-testid="datasets-valid">{String(form.isValid('datasets'))}</span>
            <span data-testid="datasets-value">{JSON.stringify(form.values.datasets)}</span>
        </>
    )
}
