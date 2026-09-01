import { vi } from 'vitest'
import {
    act,
    actionResult,
    beforeEach,
    createTestProposalDraft,
    createTestQueryWrapper,
    db,
    describe,
    expect,
    faker,
    it,
    renderHook,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { notifications } from '@mantine/notifications'
import { useForm } from '@mantine/form'
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { finalizeStudySubmissionAction } from '@/server/actions/study-request'
import { Routes } from '@/lib/routes'
import { lexicalJson } from '@/lib/lexical'
import {
    initialProposalValues,
    proposalFormSchema,
    type ProposalFormValues,
} from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { SUBMIT_BUTTON_ID } from '@/app/[orgSlug]/study/[studyId]/proposal/field-ids'
import { useYjsFormMap } from '@/hooks/use-yjs-form-map'
import {
    SUBMIT_FAILURE_MESSAGE,
    SUBMIT_FAILURE_TITLE,
    SUBMIT_FAILURE_UNSAVED_MESSAGE,
    SUBMIT_SUCCESS_TITLE,
    useSubmitProposal,
} from './use-submit-proposal'

const buildValidProposalValues = (piUserId: string): ProposalFormValues => ({
    title: 'Collaboration Title',
    datasets: ['ds-1'],
    researchQuestions: lexicalJson('What works for retention?'),
    projectSummary: lexicalJson('Examines retention strategies in detail.'),
    impact: lexicalJson('Findings inform future curriculum design.'),
    additionalNotes: '',
    piName: 'Dr. PI',
    piUserId,
})

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

describe('useSubmitProposal', () => {
    let tabSessionId: string

    beforeEach(() => {
        tabSessionId = faker.string.uuid()
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()
    })

    it('successful submit broadcasts the event and navigates', async () => {
        const { enclave, lab, studyId, user } = await createTestProposalDraft({ enclaveSlug: 'submit-happy' })
        const { yjsForm, sendStateless } = buildStubYjsForm()

        const { result } = renderHook(
            () => {
                const form = useForm<ProposalFormValues>({
                    mode: 'controlled',
                    initialValues: buildValidProposalValues(user.id),
                })
                const submit = useSubmitProposal({ studyId, form, yjsForm, tabSessionId })
                return { form, ...submit }
            },
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitProposal()
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
        expect(payload.orgName).toBe(enclave.name)

        await waitFor(() => expect(memoryRouter.asPath).toBe(Routes.studySubmitted({ orgSlug: lab.slug, studyId })), {
            timeout: 5000,
        })
    })

    // OTTER-690: submit is the moment study.title becomes immutable, so a stale Step 2 copy
    // landing here would be permanent.
    it('leaves the Step 1 title untouched on submit', async () => {
        const { studyId, user } = await createTestProposalDraft({
            enclaveSlug: 'submit-title-owner',
            studyInfo: { title: 'Chosen on Step 1' },
        })
        const { yjsForm, sendStateless } = buildStubYjsForm()

        const { result } = renderHook(
            () => {
                const form = useForm<ProposalFormValues>({
                    mode: 'controlled',
                    initialValues: { ...buildValidProposalValues(user.id), title: 'stale Step 2 copy' },
                })
                const submit = useSubmitProposal({ studyId, form, yjsForm, tabSessionId })
                return { form, ...submit }
            },
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitProposal()
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

    it('does not call the action or navigate when validation fails', async () => {
        const { studyId } = await createTestProposalDraft({ enclaveSlug: 'submit-invalid' })
        const { yjsForm, sendStateless } = buildStubYjsForm()

        const { result } = renderHook(
            () => {
                const form = useForm<ProposalFormValues>({
                    mode: 'controlled',
                    initialValues: initialProposalValues,
                    validate: zodResolver(proposalFormSchema),
                })
                const submit = useSubmitProposal({ studyId, form, yjsForm, tabSessionId })
                return { form, ...submit }
            },
            { wrapper: createTestQueryWrapper() },
        )

        act(() => {
            result.current.submitProposal()
        })

        const study = await db.selectFrom('study').select('status').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(study.status).toBe('DRAFT')
        expect(memoryRouter.asPath).toBe('/start')
        expect(sendStateless).not.toHaveBeenCalled()
    })

    it('reports an error and does not broadcast when the proposal was already submitted', async () => {
        const { studyId, user } = await createTestProposalDraft({ enclaveSlug: 'submit-concurrent' })

        actionResult(await finalizeStudySubmissionAction({ studyId }))

        const { yjsForm, sendStateless } = buildStubYjsForm()

        const { result } = renderHook(
            () => {
                const form = useForm<ProposalFormValues>({
                    mode: 'controlled',
                    initialValues: buildValidProposalValues(user.id),
                })
                const submit = useSubmitProposal({ studyId, form, yjsForm, tabSessionId })
                return { form, ...submit }
            },
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitProposal()
        })

        await waitFor(() => expect(notifications.show).toHaveBeenCalled())
        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => arg && (arg as { title?: string }).title === SUBMIT_FAILURE_TITLE,
        )
        expect(errorCall).toBeDefined()
        expect(errorCall?.[0]).toMatchObject({ color: 'red', message: SUBMIT_FAILURE_MESSAGE })
        expect(sendStateless).not.toHaveBeenCalled()
        // Staying on the form is what makes "your work is saved" recoverable.
        expect(memoryRouter.asPath).toBe('/start')
    })

    it('says the work was not saved when the recovery save fails too', async () => {
        const { studyId, user } = await createTestProposalDraft({ enclaveSlug: 'submit-unsaved' })
        actionResult(await finalizeStudySubmissionAction({ studyId }))

        const { yjsForm } = buildStubYjsForm()
        const { result } = renderHook(
            () => {
                const form = useForm<ProposalFormValues>({
                    mode: 'controlled',
                    initialValues: buildValidProposalValues(user.id),
                })
                const submit = useSubmitProposal({ studyId, form, yjsForm, tabSessionId })
                return { form, ...submit }
            },
            { wrapper: createTestQueryWrapper() },
        )

        // Dirty, so the recovery save runs rather than short-circuiting on a pristine form.
        act(() => {
            result.current.form.setFieldValue('impact', lexicalJson('Revised impact statement.'))
        })

        await act(async () => {
            result.current.submitProposal()
        })

        await waitFor(() => {
            const errorCall = (notifications.show as Mock).mock.calls.find(
                ([arg]) => arg && (arg as { title?: string }).title === SUBMIT_FAILURE_TITLE,
            )
            expect(errorCall?.[0]).toMatchObject({ color: 'red', message: SUBMIT_FAILURE_UNSAVED_MESSAGE })
        })
    })

    it('puts the submit button back in view after a failure (OTTER-691)', async () => {
        const { studyId, user } = await createTestProposalDraft({ enclaveSlug: 'submit-scroll' })
        actionResult(await finalizeStudySubmissionAction({ studyId }))

        // A real node under the real id, so this asserts the Submit button was scrolled to rather
        // than merely that some scroll happened.
        const submitButton = document.createElement('button')
        submitButton.id = SUBMIT_BUTTON_ID
        submitButton.scrollIntoView = vi.fn()
        document.body.appendChild(submitButton)

        const { yjsForm } = buildStubYjsForm()
        const { result } = renderHook(
            () => {
                const form = useForm<ProposalFormValues>({
                    mode: 'controlled',
                    initialValues: buildValidProposalValues(user.id),
                })
                return useSubmitProposal({ studyId, form, yjsForm, tabSessionId })
            },
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitProposal()
        })

        await waitFor(() => expect(submitButton.scrollIntoView).toHaveBeenCalled())
        expect(submitButton.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    })

    it('announces a successful submission before navigating away (OTTER-691)', async () => {
        const { studyId, user } = await createTestProposalDraft({ enclaveSlug: 'submit-success-toast' })
        const { yjsForm } = buildStubYjsForm()

        const { result } = renderHook(
            () => {
                const form = useForm<ProposalFormValues>({
                    mode: 'controlled',
                    initialValues: buildValidProposalValues(user.id),
                })
                return useSubmitProposal({ studyId, form, yjsForm, tabSessionId })
            },
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.submitProposal()
        })

        await waitFor(() => expect(memoryRouter.asPath).toContain('/submitted'))
        const successCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => arg && (arg as { title?: string }).title === SUBMIT_SUCCESS_TITLE,
        )
        expect(successCall).toBeDefined()
        expect(successCall?.[0]).toMatchObject({ color: 'green' })
    })
})
