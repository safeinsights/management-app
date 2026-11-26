import { useParams } from 'next/navigation'
import { type Mock, describe, expect, it, vi } from 'vitest'
import { notifications } from '@mantine/notifications'
import {
    advanceTimers,
    afterEach,
    cleanupWorkspaceDirs,
    codeResubmissionNoteDraftOf,
    createTestQueryClient,
    createWorkspaceDir,
    fakeTimeouts,
    fireEvent,
    insertTestJobStatuses,
    insertTestSubmittedCode,
    mockSessionWithTestData,
    renderWithProviders,
    restoreRealTimers,
    screen,
    waitFor,
    waitForPendingMutations,
    writeWorkspaceFiles,
    captureStudyEvents,
} from '@/tests/unit.helpers'
import { stubJobQueue } from '@/tests/job-queue.helpers'
import { queryKeys } from '@/lib/query-keys'
import { EditCodeResubmitProvider, useEditCodeResubmit } from './context'
import { saveCodeResubmissionNoteDraftAction } from '@/server/actions/study-code.actions'

// Real by default. A save that rejects after the provider unmounts is a transport failure no real
// action produces, so that test fails the call itself.
vi.mock('@/server/actions/study-code.actions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/actions/study-code.actions')>()
    return { ...actual, saveCodeResubmissionNoteDraftAction: vi.fn(actual.saveCodeResubmissionNoteDraftAction) }
})

// A resubmit emails the reviewers once it commits. Spread the real module: mailer reads SI_EMAIL from it.
vi.mock('@/server/mailgun', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/mailgun')>()),
    deliver: vi.fn(),
}))

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const setupSubmittedCode = async ({ changesRequested = false } = {}) => {
    const { org: lab, user } = await mockSessionWithTestData({ orgType: 'lab' })
    ;(useParams as Mock).mockReturnValue({ orgSlug: lab.slug })
    return insertTestSubmittedCode({ lab, researcherId: user.id, changesRequested })
}

const workspaceRoots: string[] = []

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
    afterEach(() => cleanupWorkspaceDirs(workspaceRoots))

    // A Server Action posts to whatever route is current, so an autosave in flight across a
    // navigation rejects; reporting it would toast on a page the researcher already left.
    it('does not report an autosave that rejects after the provider unmounts', async () => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })

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

        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('retries the same note after a save failure instead of marking it saved', async () => {
        const { study, job } = await setupSubmittedCode()
        const onSaveResult = vi.fn()

        renderWithProviders(
            <EditCodeResubmitProvider studyId={study.id} orgName="Test Org" initialNote="">
                <Harness onSaveResult={onSaveResult} />
            </EditCodeResubmitProvider>,
        )

        const note = 'same failed draft note'
        fireEvent.change(screen.getByLabelText('Resubmission note'), { target: { value: note } })
        await waitFor(() => expect(screen.getByLabelText('Resubmission note')).toHaveValue(note))

        // Refused until the reviewer has asked for changes.
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaveResult).toHaveBeenCalledWith(false))

        await insertTestJobStatuses(job.id, ['CODE-CHANGES-REQUESTED'])
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaveResult).toHaveBeenCalledWith(true))

        expect(await codeResubmissionNoteDraftOf(study.id)).toBe(note)
    })

    // OTTER-753: the second researcher is only kicked out if the resubmit publishes the event.
    it('publishes code-submitted from the server after a successful resubmit', async () => {
        stubJobQueue()
        const { study } = await setupSubmittedCode({ changesRequested: true })
        const events = captureStudyEvents()
        const root = await createWorkspaceDir('resubmit-broadcast')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, { 'main.r': 'print("fixed")' })

        renderWithProviders(
            <EditCodeResubmitProvider studyId={study.id} orgName="Test Org" initialNote="fixed the loop">
                <Harness onSaveResult={vi.fn()} />
            </EditCodeResubmitProvider>,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Resubmit' }))

        // The simulated scan that follows publishes its own job-status event.
        await waitFor(() => expect(events.events.some((event) => event.change === 'code-submitted')).toBe(true))
        expect(events.events[0]).toMatchObject({
            studyId: study.id,
            change: 'code-submitted',
            submittedBy: { name: expect.stringMatching(/.+/) },
            originTabId: expect.any(String),
        })
        expect(events.executors[0].isTransaction).toBe(true)
    })

    it('marks the cached previews of the resubmitted round stale, since the round keeps its job id', async () => {
        stubJobQueue()
        const { study, job } = await setupSubmittedCode({ changesRequested: true })
        const root = await createWorkspaceDir('resubmit-previews')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, { 'main.r': 'print("fixed")' })
        const queryClient = createTestQueryClient()
        const previewKey = queryKeys.jobCodeFile(job.id, 'main.r')
        queryClient.setQueryData(previewKey, { fileName: 'main.r', contents: 'print("old")' })

        renderWithProviders(
            <EditCodeResubmitProvider studyId={study.id} orgName="Test Org" initialNote="fixed the loop">
                <Harness onSaveResult={vi.fn()} />
            </EditCodeResubmitProvider>,
            { queryClient },
        )
        fireEvent.click(screen.getByRole('button', { name: 'Resubmit' }))

        await waitForPendingMutations()
        expect(queryClient.getQueryState(previewKey)?.isInvalidated).toBe(true)
    })
})
