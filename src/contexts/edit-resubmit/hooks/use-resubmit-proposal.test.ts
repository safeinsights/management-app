import { vi } from 'vitest'
import {
    act,
    beforeEach,
    createTestProposalDraft,
    createTestQueryWrapper,
    db,
    describe,
    expect,
    faker,
    it,
    renderHook,
    setTestStudyStatus,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { notifications } from '@mantine/notifications'
import { useForm } from '@mantine/form'
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { Routes } from '@/lib/routes'
import { lexicalJson } from '@/lib/lexical'
import {
    draftProposalFormSchema,
    initialProposalValues,
    type ProposalFormValues,
} from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { SUBMIT_BUTTON_ID } from '@/app/[orgSlug]/study/[studyId]/proposal/field-ids'
import {
    initialResubmitNoteValue,
    proposalResubmitNoteSchema,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import {
    SUBMIT_FAILURE_MESSAGE,
    SUBMIT_FAILURE_TITLE,
    SUBMIT_FAILURE_UNSAVED_MESSAGE,
    SUBMIT_SUCCESS_TITLE,
} from '@/contexts/proposal/hooks/submission-toasts'
import { useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { useResubmitProposal } from './use-resubmit-proposal'

const buildValidProposalValues = (piUserId: string): ProposalFormValues => ({
    title: 'Resubmitted Title',
    datasets: ['ds-1'],
    researchQuestions: lexicalJson('What works for retention?'),
    projectSummary: lexicalJson('Examines retention strategies in detail.'),
    impact: lexicalJson('Findings inform future curriculum design.'),
    additionalNotes: '',
    piName: 'Dr. PI',
    piUserId,
})

const VALID_NOTE = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ')

type StubYjsForm = ReturnType<typeof useYjsFormMap>

const buildStubYjsForm = (): { yjsForm: StubYjsForm; sendStateless: Mock } => {
    const sendStateless = vi.fn()
    const yjsForm: StubYjsForm = {
        provider: { sendStateless } as unknown as HocuspocusProvider,
        fieldsMap: null,
        isSynced: true,
        editedKeys: new Set(),
        pushField: vi.fn(),
        pushPI: vi.fn(),
    }
    return { yjsForm, sendStateless }
}

type HookArgs = {
    studyId: string
    values: ProposalFormValues
    note?: string
    yjsForm: StubYjsForm
    tabSessionId: string
    flushNote?: () => Promise<boolean>
    withValidation?: boolean
}

const renderResubmit = ({
    studyId,
    values,
    note = VALID_NOTE,
    yjsForm,
    tabSessionId,
    flushNote = () => Promise.resolve(true),
    withValidation = false,
}: HookArgs) =>
    renderHook(
        () => {
            const form = useForm<ProposalFormValues>({
                mode: 'controlled',
                initialValues: values,
                validate: withValidation ? zodResolver(draftProposalFormSchema) : undefined,
            })
            const noteForm = useForm<ResubmitNoteValue>({
                mode: 'controlled',
                initialValues: { ...initialResubmitNoteValue, resubmissionNote: note },
                validate: withValidation ? zodResolver(proposalResubmitNoteSchema) : undefined,
            })
            const resubmit = useResubmitProposal({ studyId, form, noteForm, yjsForm, tabSessionId, flushNote })
            return { form, noteForm, ...resubmit }
        },
        { wrapper: createTestQueryWrapper() },
    )

const failureToast = () =>
    (notifications.show as Mock).mock.calls.find(
        ([arg]) => arg && (arg as { title?: string }).title === SUBMIT_FAILURE_TITLE,
    )

describe('useResubmitProposal', () => {
    let tabSessionId: string

    beforeEach(() => {
        tabSessionId = faker.string.uuid()
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()
    })

    it('successful resubmit broadcasts the proposal-submitted event and navigates', async () => {
        const { enclave, lab, studyId, user } = await createTestProposalDraft({ enclaveSlug: 'resubmit-happy' })
        await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
        const { yjsForm, sendStateless } = buildStubYjsForm()

        const { result } = renderResubmit({
            studyId,
            values: buildValidProposalValues(user.id),
            yjsForm,
            tabSessionId,
        })

        await act(async () => {
            result.current.resubmit()
        })

        await waitFor(() => expect(sendStateless).toHaveBeenCalledTimes(1), { timeout: 5000 })

        const updatedStudy = await db
            .selectFrom('study')
            .select('status')
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('PENDING-REVIEW')

        const payload = JSON.parse(sendStateless.mock.calls[0][0] as string)
        expect(payload.type).toBe('proposal-submitted')
        expect(payload.studyId).toBe(studyId)
        expect(payload.submittedByTabId).toBe(tabSessionId)
        expect(typeof payload.submittedByName).toBe('string')
        expect(payload.submittedByName.length).toBeGreaterThan(0)
        expect(typeof payload.submittedByClerkId).toBe('string')
        expect(payload.submittedByClerkId.length).toBeGreaterThan(0)
        expect(payload.orgName).toBe(enclave.name)

        await waitFor(() => expect(memoryRouter.asPath).toBe(Routes.studySubmitted({ orgSlug: lab.slug, studyId })), {
            timeout: 5000,
        })
    })

    // The title field left this page (OTTER-762), so the form's copy is only a seed and must not
    // reach the study row.
    it('leaves the stored title untouched on resubmit', async () => {
        const { studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'resubmit-title-owner',
            studyInfo: { title: 'Chosen on Step 1' },
        })
        await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
        const { yjsForm, sendStateless } = buildStubYjsForm()

        const { result } = renderResubmit({
            studyId,
            values: { ...buildValidProposalValues(user.id), title: 'stale form copy' },
            yjsForm,
            tabSessionId,
        })

        await act(async () => {
            result.current.resubmit()
        })

        await waitFor(() => expect(sendStateless).toHaveBeenCalledTimes(1), { timeout: 5000 })

        const study = await db
            .selectFrom('study')
            .select(['title', 'status'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow()
        expect(study.status).toBe('PENDING-REVIEW')
        expect(study.title).toBe('Chosen on Step 1')
    })

    it('announces a successful resubmission before navigating away (OTTER-762)', async () => {
        const { studyId, user } = await createTestProposalDraft({ enclaveSlug: 'resubmit-success-toast' })
        await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
        const { yjsForm } = buildStubYjsForm()

        const { result } = renderResubmit({
            studyId,
            values: buildValidProposalValues(user.id),
            yjsForm,
            tabSessionId,
        })

        await act(async () => {
            result.current.resubmit()
        })

        await waitFor(() => expect(memoryRouter.asPath).toContain('/submitted'))
        const successCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => arg && (arg as { title?: string }).title === SUBMIT_SUCCESS_TITLE,
        )
        expect(successCall).toBeDefined()
        expect(successCall?.[0]).toMatchObject({ color: 'green' })
    })

    it('does not call the action or broadcast when validation fails', async () => {
        const { studyId } = await createTestProposalDraft({ enclaveSlug: 'resubmit-invalid' })
        await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
        const { yjsForm, sendStateless } = buildStubYjsForm()

        const { result } = renderResubmit({
            studyId,
            values: initialProposalValues,
            note: '',
            yjsForm,
            tabSessionId,
            withValidation: true,
        })

        act(() => {
            result.current.resubmit()
        })

        const study = await db.selectFrom('study').select('status').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(study.status).toBe('CHANGE-REQUESTED')
        expect(memoryRouter.asPath).toBe('/start')
        expect(sendStateless).not.toHaveBeenCalled()
    })

    it('shows the failure toast with the card copy and stays put when the proposal can no longer be resubmitted', async () => {
        const { studyId, user } = await createTestProposalDraft({ enclaveSlug: 'resubmit-wrong-status' })
        // Staying DRAFT rather than CHANGE-REQUESTED is what makes the action reject.
        const { yjsForm, sendStateless } = buildStubYjsForm()

        const { result } = renderResubmit({
            studyId,
            values: buildValidProposalValues(user.id),
            yjsForm,
            tabSessionId,
        })

        await act(async () => {
            result.current.resubmit()
        })

        await waitFor(() => expect(failureToast()).toBeDefined())
        expect(failureToast()?.[0]).toMatchObject({ color: 'red', message: SUBMIT_FAILURE_MESSAGE })
        expect(sendStateless).not.toHaveBeenCalled()
        // Staying on the form is what makes "your work is saved" recoverable.
        expect(memoryRouter.asPath).toBe('/start')
    })

    it('says the work was not saved when the note flush fails too', async () => {
        const { studyId, user } = await createTestProposalDraft({ enclaveSlug: 'resubmit-note-unsaved' })
        const { yjsForm } = buildStubYjsForm()

        const { result } = renderResubmit({
            studyId,
            values: buildValidProposalValues(user.id),
            yjsForm,
            tabSessionId,
            flushNote: () => Promise.resolve(false),
        })

        await act(async () => {
            result.current.resubmit()
        })

        await waitFor(() => {
            expect(failureToast()?.[0]).toMatchObject({ color: 'red', message: SUBMIT_FAILURE_UNSAVED_MESSAGE })
        })
    })

    it('says the work was not saved when the recovery save of the fields fails too', async () => {
        const { studyId, user } = await createTestProposalDraft({ enclaveSlug: 'resubmit-fields-unsaved' })
        // PENDING-REVIEW rejects both the resubmit and the draft save behind it.
        await setTestStudyStatus(studyId, 'PENDING-REVIEW')
        const { yjsForm } = buildStubYjsForm()

        const { result } = renderResubmit({
            studyId,
            values: buildValidProposalValues(user.id),
            yjsForm,
            tabSessionId,
        })

        // Dirty, so the recovery save runs rather than short-circuiting on a pristine form.
        act(() => {
            result.current.form.setFieldValue('impact', lexicalJson('Revised impact statement.'))
        })

        await act(async () => {
            result.current.resubmit()
        })

        await waitFor(() => {
            expect(failureToast()?.[0]).toMatchObject({ color: 'red', message: SUBMIT_FAILURE_UNSAVED_MESSAGE })
        })
    })

    it('puts the resubmit button back in view after a failure (OTTER-762)', async () => {
        const { studyId, user } = await createTestProposalDraft({ enclaveSlug: 'resubmit-scroll' })
        const { yjsForm } = buildStubYjsForm()

        // A real node under the real id, so this asserts the Resubmit button was scrolled to rather
        // than merely that some scroll happened.
        const submitButton = document.createElement('button')
        submitButton.id = SUBMIT_BUTTON_ID
        submitButton.scrollIntoView = vi.fn()
        document.body.appendChild(submitButton)

        const { result } = renderResubmit({
            studyId,
            values: buildValidProposalValues(user.id),
            yjsForm,
            tabSessionId,
        })

        await act(async () => {
            result.current.resubmit()
        })

        await waitFor(() => expect(submitButton.scrollIntoView).toHaveBeenCalled())
        expect(submitButton.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    })
})
