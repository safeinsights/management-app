import { vi } from 'vitest'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { studyEventsDocName, type StudyEvent } from '@/lib/collaboration-documents'
import * as studyEvents from '@/server/study-events'

// A pass-through spy: the real pg_notify still runs, so Postgres checks the channel and payload,
// and the test transaction's rollback drops it. Records each event and the executor it ran on.
export function captureStudyEvents() {
    // A spy from an earlier test stays installed, so start from no calls.
    const spy = vi.spyOn(studyEvents, 'notifyStudyChanged')
    spy.mockClear()
    return {
        get events() {
            return spy.mock.calls.map(([, input]) => input)
        },
        get executors() {
            return spy.mock.calls.map(([executor]) => executor)
        },
    }
}

type FakeStudyEventsProvider = {
    configuration: { name?: string }
    destroy: ReturnType<typeof vi.fn>
    __emit: (event: string, ...args: unknown[]) => void
}

// The study events channels the global @hocuspocus/provider fake has opened, oldest first.
export const studyEventsChannels = (studyId: string) =>
    (HocuspocusProvider as unknown as { __instances: FakeStudyEventsProvider[] }).__instances.filter(
        (provider) => provider.configuration.name === studyEventsDocName(studyId),
    )

// Delivers an event the way the editor relays it, on the newest channel open for the study.
export function emitStudyEvent(event: Omit<StudyEvent, 'type'>) {
    const channel = studyEventsChannels(event.studyId).at(-1)
    if (!channel) throw new Error(`no study events channel is open for study ${event.studyId}`)
    channel.__emit('stateless', { payload: JSON.stringify({ type: 'study-changed', ...event }) })
}
