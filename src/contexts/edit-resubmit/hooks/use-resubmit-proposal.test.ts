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
    initialProposalValues,
    proposalFormSchema,
    type ProposalFormValues,
} from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import {
    initialResubmitNoteValue,
    resubmitNoteSchema,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
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
        pushField: vi.fn(),
        pushPI: vi.fn(),
    }
    return { yjsForm, sendStateless }
}

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

        const { result } = renderHook(
            () => {
                const form = useForm<ProposalFormValues>({
                    mode: 'controlled',
                    initialValues: buildValidProposalValues(user.id),
                })
                const noteForm = useForm<ResubmitNoteValue>({
                    mode: 'controlled',
                    initialValues: { resubmissionNote: VALID_NOTE },
                })
                const resubmit = useResubmitProposal({ studyId, form, noteForm, yjsForm, tabSessionId })
                return { form, noteForm, ...resubmit }
            },
            { wrapper: createTestQueryWrapper() },
        )

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

    it('does not call the action or broadcast when validation fails', async () => {
        const { studyId } = await createTestProposalDraft({ enclaveSlug: 'resubmit-invalid' })
        await setTestStudyStatus(studyId, 'CHANGE-REQUESTED')
        const { yjsForm, sendStateless } = buildStubYjsForm()

        const { result } = renderHook(
            () => {
                const form = useForm<ProposalFormValues>({
                    mode: 'controlled',
                    initialValues: initialProposalValues,
                    validate: zodResolver(proposalFormSchema),
                })
                // empty note → noteForm validation fails
                const noteForm = useForm<ResubmitNoteValue>({
                    mode: 'controlled',
                    initialValues: initialResubmitNoteValue,
                    validate: zodResolver(resubmitNoteSchema),
                })
                const resubmit = useResubmitProposal({ studyId, form, noteForm, yjsForm, tabSessionId })
                return { form, noteForm, ...resubmit }
            },
            { wrapper: createTestQueryWrapper() },
        )

        act(() => {
            result.current.resubmit()
        })

        const study = await db.selectFrom('study').select('status').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(study.status).toBe('CHANGE-REQUESTED')
        expect(memoryRouter.asPath).toBe('/start')
        expect(sendStateless).not.toHaveBeenCalled()
    })

    it('reports an error and does not broadcast when the proposal can no longer be resubmitted', async () => {
        const { studyId, user } = await createTestProposalDraft({ enclaveSlug: 'resubmit-wrong-status' })
        // study stays DRAFT (not CHANGE-REQUESTED) → resubmitProposalAction rejects
        const { yjsForm, sendStateless } = buildStubYjsForm()

        const { result } = renderHook(
            () => {
                const form = useForm<ProposalFormValues>({
                    mode: 'controlled',
                    initialValues: buildValidProposalValues(user.id),
                })
                const noteForm = useForm<ResubmitNoteValue>({
                    mode: 'controlled',
                    initialValues: { resubmissionNote: VALID_NOTE },
                })
                const resubmit = useResubmitProposal({ studyId, form, noteForm, yjsForm, tabSessionId })
                return { form, noteForm, ...resubmit }
            },
            { wrapper: createTestQueryWrapper() },
        )

        await act(async () => {
            result.current.resubmit()
        })

        await waitFor(() => expect(notifications.show).toHaveBeenCalled())
        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => arg && (arg as { title?: string }).title === 'Failed to resubmit proposal',
        )
        expect(errorCall).toBeDefined()
        expect(sendStateless).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/start')
    })
})
