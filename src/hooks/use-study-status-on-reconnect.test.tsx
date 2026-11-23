import { vi } from 'vitest'
import { notifications } from '@mantine/notifications'
import * as RouterMock from 'next-router-mock'
import {
    act,
    advanceTimers,
    afterEach,
    beforeEach,
    db,
    describe,
    expect,
    fakeTimeouts,
    insertTestJobStatuses,
    insertTestStudyJobData,
    insertTestStudyOnly,
    it,
    mockSessionWithTestData,
    render,
    restoreRealTimers,
    staleActionError,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import type { StudyJobStatus, StudyStatus } from '@/database/types'
import { YjsWebsocketProvider, __resetSharedYjsWebsocketForTests } from '@/lib/realtime/yjs-websocket-context'
import { getStudyStatusAction } from '@/server/actions/editor.actions'
import { STALE_DEPLOYMENT_NOTIFICATION_ID } from '@/components/errors'
import { STALE_DEPLOYMENT_TITLE } from '@/lib/errors'
import {
    STATUS_CHECK_FAILURE_TITLE,
    StudyKickOutProvider,
    useStudyStatusOnReconnect,
    useTriggerStudyKickOut,
} from './use-study-status-on-reconnect'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memoryRouter = (RouterMock as any).memoryRouter as { asPath: string; setCurrentUrl: (url: string) => void }

// Real by default, so a status comes from the study's rows. A test overrides it only for a transport
// failure, which a real action never throws, or under timers jumped past pg-pool's 10s idle timeout,
// whose firing would close the client the test transaction runs on.
vi.mock('@/server/actions/editor.actions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/actions/editor.actions')>()
    return { ...actual, getStudyStatusAction: vi.fn(actual.getStudyStatusAction) }
})

const ctorSpy = (HocuspocusProviderWebsocket as unknown as { __ctor: Mock }).__ctor
const getStudyStatusActionMock = getStudyStatusAction as unknown as Mock
const showMock = notifications.show as unknown as Mock

// The real HocuspocusProviderWebsocket types `status` as an enum; the mock in tests/vitest.setup.ts
// exposes a writable string plus a synchronous `__emit`.
type FakeSocket = {
    status: 'connecting' | 'connected' | 'disconnected'
    __emit: (event: string, ...args: unknown[]) => void
}

// For the tests whose reply is overridden, so no row is read.
const STUDY_ID = '00000000-0000-0000-0000-000000000000'

// The session's org submitted the study, which lets it view the study in any status. The first job
// status comes with the job and the rest are stamped after it.
const insertStudy = async (status: StudyStatus, [jobStatus, ...laterStatuses]: StudyJobStatus[] = []) => {
    const { org } = await mockSessionWithTestData()
    const { study, job } = await insertTestStudyJobData({ org, studyStatus: status, jobStatus })
    await insertTestJobStatuses(job.id, laterStatuses)
    return { studyId: study.id, jobId: job.id }
}

const Harness = ({ studyId, enabled = true }: { studyId: string; enabled?: boolean }) => {
    useStudyStatusOnReconnect({
        studyId,
        orgSlug: 'org',
        editableStatuses: ['DRAFT', 'CHANGE-REQUESTED'],
        redirectTarget: 'studySubmitted',
        enabled,
    })
    return null
}

const mount = (studyId: string, props: { enabled?: boolean } = {}) =>
    render(
        <YjsWebsocketProvider>
            <Harness studyId={studyId} enabled={props.enabled} />
        </YjsWebsocketProvider>,
    )

describe('useStudyStatusOnReconnect', () => {
    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
        showMock.mockClear()
        getStudyStatusActionMock.mockReset()
        memoryRouter.setCurrentUrl('/')
    })

    afterEach(() => {
        __resetSharedYjsWebsocketForTests()
        restoreRealTimers()
    })

    it('checks status once on initial connect', async () => {
        const { studyId } = await insertStudy('DRAFT')
        mount(studyId)

        await waitFor(() => expect(getStudyStatusActionMock).toHaveResolvedTimes(1))
        expect(memoryRouter.asPath).toBe('/')
        expect(showMock).not.toHaveBeenCalled()
    })

    it('redirects when status is no longer editable on initial connect', async () => {
        const { studyId } = await insertStudy('PENDING-REVIEW')
        mount(studyId)

        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Submission complete' }))
    })

    it('does not poll on a stable connection', async () => {
        fakeTimeouts()
        getStudyStatusActionMock.mockResolvedValue({ status: 'DRAFT' })
        mount(STUDY_ID)

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(1))
        // Long enough that the old 10s poll would have fired several times.
        await advanceTimers(30_000)
        expect(getStudyStatusActionMock).toHaveBeenCalledTimes(1)
    })

    it('checks again after a disconnect → reconnect', async () => {
        const { studyId } = await insertStudy('DRAFT')
        mount(studyId)
        await waitFor(() => expect(getStudyStatusActionMock).toHaveResolvedTimes(1))

        const socket = (HocuspocusProviderWebsocket as unknown as { __instances: FakeSocket[] }).__instances[0]
        act(() => {
            socket.status = 'disconnected'
            socket.__emit('status', { status: 'disconnected' })
        })
        act(() => {
            socket.status = 'connected'
            socket.__emit('status', { status: 'connected' })
        })
        await waitFor(() => expect(getStudyStatusActionMock).toHaveResolvedTimes(2))
    })

    it('does nothing when disabled', async () => {
        const { studyId } = await insertStudy('PENDING-REVIEW')
        fakeTimeouts()
        mount(studyId, { enabled: false })

        await advanceTimers(30_000)
        expect(getStudyStatusActionMock).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/')
    })

    it('uses the isEditable predicate when provided', async () => {
        const { studyId } = await insertStudy('PENDING-REVIEW', ['CODE-SUBMITTED'])

        const Predicated = () => {
            useStudyStatusOnReconnect({
                studyId,
                orgSlug: 'org',
                editableStatuses: [],
                isEditable: ({ status, latestJobStatus }) =>
                    status === 'PENDING-REVIEW' &&
                    (latestJobStatus === 'CODE-SUBMITTED' || latestJobStatus === 'CODE-SCANNED'),
                redirectTarget: 'studyReview',
                enabled: true,
            })
            return null
        }

        render(
            <YjsWebsocketProvider>
                <Predicated />
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(getStudyStatusActionMock).toHaveResolvedTimes(1))
        // The empty editableStatuses allowlist would otherwise force a redirect.
        expect(memoryRouter.asPath).toBe('/')
        expect(showMock).not.toHaveBeenCalled()
    })

    it('predicate path redirects when criteria no longer match', async () => {
        const { studyId } = await insertStudy('APPROVED', ['CODE-APPROVED'])

        const Predicated = () => {
            useStudyStatusOnReconnect({
                studyId,
                orgSlug: 'org',
                editableStatuses: [],
                isEditable: ({ status, latestJobStatus }) =>
                    status === 'PENDING-REVIEW' &&
                    (latestJobStatus === 'CODE-SUBMITTED' || latestJobStatus === 'CODE-SCANNED'),
                redirectTarget: 'studyReview',
                enabled: true,
            })
            return null
        }

        render(
            <YjsWebsocketProvider>
                <Predicated />
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        // A review screen says a decision was submitted. The proposal wording belongs to the
        // screen that redirects to studySubmitted, and the default now follows the target.
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Decision submitted' }))
    })

    it('sends a code round to the code step rather than bare /review', async () => {
        const { studyId } = await insertStudy('APPROVED', ['CODE-APPROVED'])

        const CodeRound = () => {
            useStudyStatusOnReconnect({
                studyId,
                orgSlug: 'org',
                editableStatuses: [],
                isEditable: ({ latestJobStatus }) =>
                    latestJobStatus === 'CODE-SUBMITTED' || latestJobStatus === 'CODE-SCANNED',
                redirectTarget: 'studyReviewCode',
                enabled: true,
            })
            return null
        }

        render(
            <YjsWebsocketProvider>
                <CodeRound />
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(memoryRouter.asPath).toBe(`/org/study/${studyId}/review/code`))
    })

    it('gives a proposal screen and a review screen different default wording', async () => {
        const { studyId } = await insertStudy('PENDING-REVIEW')
        mount(studyId)

        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Submission complete' }))
    })
})

describe('StudyKickOutProvider + useTriggerStudyKickOut', () => {
    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
        showMock.mockClear()
        getStudyStatusActionMock.mockReset()
        memoryRouter.setCurrentUrl('/')
    })

    afterEach(() => {
        __resetSharedYjsWebsocketForTests()
        restoreRealTimers()
    })

    it('returns a no-op trigger when there is no provider in the tree', () => {
        const TriggerProbe = ({ onTrigger }: { onTrigger: (fn: () => void) => void }) => {
            onTrigger(useTriggerStudyKickOut())
            return null
        }
        let trigger: () => void = () => {}
        render(<TriggerProbe onTrigger={(fn) => (trigger = fn)} />)
        expect(() => trigger()).not.toThrow()
        expect(getStudyStatusActionMock).not.toHaveBeenCalled()
    })

    it('lets descendants imperatively fire the kick-out check', async () => {
        const { studyId } = await insertStudy('DRAFT')

        const Trigger = () => {
            const triggerKickOut = useTriggerStudyKickOut()
            return (
                <button type="button" data-testid="trigger" onClick={() => void triggerKickOut()}>
                    trigger
                </button>
            )
        }

        const { getByTestId } = render(
            <YjsWebsocketProvider>
                <StudyKickOutProvider
                    studyId={studyId}
                    orgSlug="org"
                    editableStatuses={['DRAFT', 'CHANGE-REQUESTED']}
                    redirectTarget="studySubmitted"
                >
                    <Trigger />
                </StudyKickOutProvider>
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(getStudyStatusActionMock).toHaveResolvedTimes(1))
        expect(memoryRouter.asPath).toBe('/')

        // The peer has now submitted.
        await db.updateTable('study').set({ status: 'PENDING-REVIEW' }).where('id', '=', studyId).execute()
        act(() => {
            getByTestId('trigger').click()
        })

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(2))
        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Submission complete' }))
    })

    // OTTER-726: when the status request itself cannot be made, the caller has to be told "not
    // closed" rather than left hanging, and the reader has to be told at all. "Could not ask" is not
    // the same answer as "the round is open".
    it('resolves false and reports when the status request fails at the transport', async () => {
        getStudyStatusActionMock.mockRejectedValue(new Error('Failed to fetch'))

        let outcome: boolean | undefined
        const Trigger = () => {
            const triggerKickOut = useTriggerStudyKickOut()
            return (
                <button
                    type="button"
                    data-testid="trigger"
                    onClick={() => {
                        void triggerKickOut().then((closed) => (outcome = closed))
                    }}
                >
                    trigger
                </button>
            )
        }

        const { getByTestId } = render(
            <YjsWebsocketProvider>
                <StudyKickOutProvider
                    studyId={STUDY_ID}
                    orgSlug="org"
                    editableStatuses={['DRAFT']}
                    redirectTarget="studySubmitted"
                >
                    <Trigger />
                </StudyKickOutProvider>
            </YjsWebsocketProvider>,
        )

        act(() => {
            getByTestId('trigger').click()
        })

        await waitFor(() => expect(outcome).toBe(false))
        expect(showMock).toHaveBeenCalledWith(
            expect.objectContaining({ 'data-toast-kind': 'error', title: STATUS_CHECK_FAILURE_TITLE }),
        )
        expect(memoryRouter.asPath).toBe('/')
    })

    // A tab parked on the security key form has no editor and so no live event; asking when the
    // reviewer returns to it is the moment that matters.
    it('checks again when the tab becomes visible', async () => {
        const { studyId } = await insertStudy('DRAFT')
        mount(studyId)
        await waitFor(() => expect(getStudyStatusActionMock).toHaveResolvedTimes(1))

        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'))
        })

        await waitFor(() => expect(getStudyStatusActionMock).toHaveResolvedTimes(2))
    })

    // The newest status row is CODE-SCANNED, written by the scanner after the decision. Only the
    // full status list of the named job shows that the round is closed.
    it('hands the named job status list to the predicate, so a late scan row cannot hide a decision', async () => {
        const { studyId, jobId } = await insertStudy('APPROVED', [
            'CODE-SUBMITTED',
            'CODE-APPROVED',
            'RUN-COMPLETE',
            'FILES-APPROVED',
            'CODE-SCANNED',
        ])

        const Predicated = () => {
            useStudyStatusOnReconnect({
                studyId,
                studyJobId: jobId,
                orgSlug: 'org',
                editableStatuses: [],
                isEditable: ({ jobStatuses }) => !jobStatuses.includes('FILES-APPROVED'),
                redirectTarget: 'studyReview',
                notice: { title: 'Decision submitted', message: 'Closed.' },
                enabled: true,
            })
            return null
        }

        render(
            <YjsWebsocketProvider>
                <Predicated />
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        expect(getStudyStatusActionMock).toHaveBeenCalledWith({ studyId, studyJobId: jobId })
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Decision submitted' }))
    })

    it('does not redirect twice if both reconnect and trigger fire', async () => {
        fakeTimeouts()
        getStudyStatusActionMock.mockResolvedValue({ status: 'PENDING-REVIEW' })

        const Trigger = () => {
            const triggerKickOut = useTriggerStudyKickOut()
            return (
                <button type="button" data-testid="trigger" onClick={() => void triggerKickOut()}>
                    trigger
                </button>
            )
        }

        const { getByTestId } = render(
            <YjsWebsocketProvider>
                <StudyKickOutProvider
                    studyId={STUDY_ID}
                    orgSlug="org"
                    editableStatuses={['DRAFT', 'CHANGE-REQUESTED']}
                    redirectTarget="studySubmitted"
                >
                    <Trigger />
                </StudyKickOutProvider>
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(showMock).toHaveBeenCalledTimes(1))
        act(() => {
            getByTestId('trigger').click()
        })
        await advanceTimers(30_000)
        expect(showMock).toHaveBeenCalledTimes(1)
    })
})

// OTTER-726: the transport throws when the tab is offline or posts an action id a new build no
// longer holds. Before, that was swallowed and read as "the round is still open", so the reviewer
// was told nothing until a submit failed.
describe('useStudyStatusOnReconnect when the status request fails', () => {
    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
        showMock.mockClear()
        getStudyStatusActionMock.mockReset()
        memoryRouter.setCurrentUrl('/')
    })

    afterEach(() => {
        __resetSharedYjsWebsocketForTests()
    })

    it('offers a reload when the tab posts an action id the running build has dropped', async () => {
        getStudyStatusActionMock.mockRejectedValue(staleActionError())
        mount(STUDY_ID)

        await waitFor(() =>
            expect(showMock).toHaveBeenCalledWith(
                expect.objectContaining({ id: STALE_DEPLOYMENT_NOTIFICATION_ID, title: STALE_DEPLOYMENT_TITLE }),
            ),
        )
        expect(memoryRouter.asPath).toBe('/')
    })

    it('reports a request that never arrives', async () => {
        getStudyStatusActionMock.mockRejectedValue(new TypeError('Failed to fetch'))
        mount(STUDY_ID)

        await waitFor(() =>
            expect(showMock).toHaveBeenCalledWith(
                expect.objectContaining({ 'data-toast-kind': 'error', title: STATUS_CHECK_FAILURE_TITLE }),
            ),
        )
    })

    it('reports a server that refuses to answer', async () => {
        await mockSessionWithTestData()
        // Another org's study, which this session cannot view.
        const { study } = await insertTestStudyOnly()
        mount(study.id)

        await waitFor(() =>
            expect(showMock).toHaveBeenCalledWith(
                expect.objectContaining({ 'data-toast-kind': 'error', title: STATUS_CHECK_FAILURE_TITLE }),
            ),
        )
    })

    it('stays quiet for a caller that shows its own message', async () => {
        getStudyStatusActionMock.mockRejectedValue(staleActionError())

        const Trigger = () => {
            const triggerKickOut = useTriggerStudyKickOut()
            return (
                <button
                    type="button"
                    data-testid="trigger"
                    onClick={() => void triggerKickOut({ reportFailure: false })}
                >
                    trigger
                </button>
            )
        }

        const { getByTestId } = render(
            <YjsWebsocketProvider>
                <StudyKickOutProvider
                    studyId={STUDY_ID}
                    orgSlug="org"
                    editableStatuses={['DRAFT']}
                    redirectTarget="studyReview"
                    enabled={false}
                >
                    <Trigger />
                </StudyKickOutProvider>
            </YjsWebsocketProvider>,
        )

        act(() => {
            getByTestId('trigger').click()
        })

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalled())
        expect(showMock).not.toHaveBeenCalled()
    })
})
