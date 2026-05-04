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
import { lexicalJson } from '@/lib/word-count'
import {
    initialProposalValues,
    proposalFormSchema,
    type ProposalFormValues,
} from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { useSubmitProposal } from './use-submit-proposal'

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

        // First-submit-wins: pre-flip the study to PENDING-REVIEW.
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
            ([arg]) => arg && (arg as { title?: string }).title === 'Failed to submit proposal',
        )
        expect(errorCall).toBeDefined()
        expect(sendStateless).not.toHaveBeenCalled()
        // Navigation only happens onSuccess; ensure URL didn't change.
        expect(memoryRouter.asPath).toBe('/start')
    })
})
