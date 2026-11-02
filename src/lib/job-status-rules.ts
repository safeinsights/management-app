// No imports: the editor service runs this file directly under Node, and the migrator bundle loads it.

export const JOB_STATUSES = [
    'CODE-APPROVED',
    'CODE-CHANGES-REQUESTED',
    'CODE-REJECTED',
    'CODE-SCANNED',
    'CODE-SUBMITTED',
    'FILES-APPROVED',
    'FILES-REJECTED',
    'INITIATED',
    'JOB-ERRORED',
    'JOB-PACKAGING',
    'JOB-PROVISIONING',
    'JOB-READY',
    'JOB-RUNNING',
    'RESULTS-VIEWED',
    'RUN-COMPLETE',
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

export const STUDY_STATUSES = [
    'APPROVED',
    'ARCHIVED',
    'CHANGE-REQUESTED',
    'DRAFT',
    'PENDING-REVIEW',
    'REJECTED',
] as const

export type StudyStatusValue = (typeof STUDY_STATUSES)[number]

// A round closes only after a post-run results decision; pre-run outcomes and a not-yet-reviewed
// JOB-ERRORED continue the SAME job.
export const ROUND_CLOSING_JOB_STATUSES = ['FILES-APPROVED', 'FILES-REJECTED'] as const satisfies readonly JobStatus[]

// Closes a submission round rather than the job: a change request reopens the same job for new code.
// CODE-REJECTED is omitted because reject is terminal (see codeSubmissionVersion).
export const CODE_ROUND_CLOSING_JOB_STATUSES = [
    'CODE-CHANGES-REQUESTED',
    'FILES-APPROVED',
    'FILES-REJECTED',
] as const satisfies readonly JobStatus[]

export const JOB_ACTORS = ['researcher', 'reviewer', 'enclave', 'service', 'system', 'qa'] as const

export type JobActor = (typeof JOB_ACTORS)[number]

// The senders that re-deliver a status they already reported, so a repeat from them is not an error.
const REPEATING_ACTORS: readonly JobActor[] = ['enclave', 'service', 'system']

// Deployed separately from this app, so a table row that is wrong for them must not strand a job (OTTER-973).
const MACHINE_ACTORS: readonly JobActor[] = ['enclave', 'service']

// While true, a pair the table does not permit for the enclave or a service is logged and still
// written. Set to false once the warnings stay quiet in every environment.
export const OBSERVE_MACHINE_ACTOR_PAIRS = true

// A `log` row is kept as history but leaves the job where it was: a late or out-of-order report
// must never move a job backward.
export type TransitionEffect = 'move' | 'log'

type TransitionRow = {
    to: readonly JobStatus[]
    from: readonly (JobStatus | null)[]
    effect: TransitionEffect
    roundIncrement?: boolean
    actors: readonly JobActor[]
}

const STAGES = ['JOB-PACKAGING', 'JOB-READY', 'JOB-PROVISIONING', 'JOB-RUNNING'] as const satisfies readonly JobStatus[]

const stageRows = (): TransitionRow[] =>
    STAGES.map((stage, index) => ({
        to: [stage],
        from: [...STAGES.slice(index + 1), 'JOB-ERRORED', 'RUN-COMPLETE'],
        effect: 'log',
        actors: ['service', 'enclave'],
    }))

// Effects depend only on (from, to), never on the actor, so replaying the log reproduces them.
export const JOB_TRANSITIONS: readonly TransitionRow[] = [
    { to: ['INITIATED'], from: [null], effect: 'move', actors: ['system', 'qa'] },
    { to: ['CODE-SUBMITTED'], from: ['INITIATED'], effect: 'move', actors: ['researcher'] },
    {
        to: ['CODE-SUBMITTED'],
        from: ['CODE-CHANGES-REQUESTED'],
        effect: 'move',
        roundIncrement: true,
        actors: ['researcher'],
    },
    { to: ['CODE-SCANNED'], from: ['CODE-SUBMITTED'], effect: 'move', actors: ['service', 'system'] },
    {
        to: ['CODE-SCANNED'],
        from: ['CODE-CHANGES-REQUESTED', 'CODE-APPROVED', ...STAGES, 'JOB-ERRORED', 'RUN-COMPLETE'],
        effect: 'log',
        actors: ['service', 'system'],
    },
    { to: ['JOB-ERRORED'], from: ['CODE-SUBMITTED', 'CODE-SCANNED'], effect: 'move', actors: ['service'] },
    { to: ['JOB-ERRORED'], from: ['CODE-CHANGES-REQUESTED'], effect: 'log', actors: ['service'] },
    {
        to: ['CODE-APPROVED', 'CODE-CHANGES-REQUESTED'],
        from: ['CODE-SUBMITTED', 'CODE-SCANNED', 'JOB-ERRORED'],
        effect: 'move',
        actors: ['reviewer'],
    },
    { to: ['JOB-PACKAGING'], from: ['CODE-APPROVED'], effect: 'move', actors: ['service'] },
    { to: ['JOB-READY'], from: ['CODE-APPROVED'], effect: 'move', actors: ['service', 'system'] },
    { to: ['JOB-READY'], from: ['JOB-PACKAGING'], effect: 'move', actors: ['service'] },
    { to: ['JOB-PROVISIONING'], from: ['JOB-READY'], effect: 'move', actors: ['enclave'] },
    { to: ['JOB-RUNNING'], from: ['JOB-READY', 'JOB-PROVISIONING'], effect: 'move', actors: ['enclave'] },
    { to: ['JOB-ERRORED'], from: ['CODE-APPROVED', ...STAGES], effect: 'move', actors: ['service', 'enclave'] },
    ...stageRows(),
    {
        to: ['RUN-COMPLETE'],
        from: ['JOB-READY', 'JOB-PROVISIONING', 'JOB-RUNNING', 'JOB-ERRORED'],
        effect: 'move',
        actors: ['enclave'],
    },
    { to: ['FILES-APPROVED', 'FILES-REJECTED'], from: ['RUN-COMPLETE'], effect: 'move', actors: ['reviewer'] },
    {
        to: ['FILES-APPROVED', 'FILES-REJECTED'],
        from: ['JOB-ERRORED'],
        effect: 'move',
        actors: ['reviewer', 'enclave'],
    },
    { to: ['RESULTS-VIEWED'], from: ['FILES-APPROVED', 'FILES-REJECTED'], effect: 'log', actors: ['researcher'] },
]

export type Transition = { effect: TransitionEffect; roundIncrement: boolean; actors: readonly JobActor[] }

export function findTransition(from: JobStatus | null, to: JobStatus): Transition | null {
    const row = JOB_TRANSITIONS.find((t) => t.to.includes(to) && t.from.includes(from))
    if (!row) return null
    return { effect: row.effect, roundIncrement: Boolean(row.roundIncrement), actors: row.actors }
}

export type TransitionRefusal = 'round-closed' | 'repeat' | 'not-permitted'

export type TransitionDecision =
    | { kind: 'refused'; reason: TransitionRefusal }
    | { kind: 'repeat' }
    | { kind: 'noop' }
    | { kind: 'write'; effect: TransitionEffect; observed: boolean }

type DecisionInput = {
    from: JobStatus | null
    to: JobStatus
    actor: JobActor
    // The job's newest row, in replay order.
    newestStatus: JobStatus | null
    hasStatus: (status: JobStatus) => boolean
}

const isRoundClosing = (status: JobStatus | null) =>
    status !== null && (ROUND_CLOSING_JOB_STATUSES as readonly JobStatus[]).includes(status)

export function decideJobTransition({ from, to, actor, newestStatus, hasStatus }: DecisionInput): TransitionDecision {
    const transition = findTransition(from, to)

    // QA drives jobs to arbitrary states; it still writes through here so the log replays the same way.
    if (actor === 'qa')
        return { kind: 'write', effect: from === to ? 'log' : (transition?.effect ?? 'move'), observed: false }

    if (isRoundClosing(from) && to !== 'RESULTS-VIEWED') return { kind: 'refused', reason: 'round-closed' }

    // Actions write comments and keys before the status, so a repeat from a person must roll them back.
    if (from === to)
        return REPEATING_ACTORS.includes(actor) ? { kind: 'repeat' } : { kind: 'refused', reason: 'repeat' }

    if (transition?.effect === 'log') {
        const alreadyLogged = to === 'RESULTS-VIEWED' ? hasStatus(to) : newestStatus === to
        if (alreadyLogged) return { kind: 'noop' }
    }

    if (transition?.actors.includes(actor)) return { kind: 'write', effect: transition.effect, observed: false }

    if (OBSERVE_MACHINE_ACTOR_PAIRS && MACHINE_ACTORS.includes(actor)) {
        return { kind: 'write', effect: transition?.effect ?? 'move', observed: true }
    }
    return { kind: 'refused', reason: 'not-permitted' }
}

// Lifecycle order. Breaks exact createdAt ties, which only rows written before the writer existed
// can have: those took now(), which is fixed for a whole transaction.
export const REPLAY_TIE_RANK: readonly JobStatus[] = [
    'INITIATED',
    'CODE-SUBMITTED',
    'CODE-SCANNED',
    'CODE-CHANGES-REQUESTED',
    'CODE-APPROVED',
    'CODE-REJECTED',
    'JOB-PACKAGING',
    'JOB-READY',
    'JOB-PROVISIONING',
    'JOB-RUNNING',
    'JOB-ERRORED',
    'RUN-COMPLETE',
    'FILES-APPROVED',
    'FILES-REJECTED',
    'RESULTS-VIEWED',
]

export type ReplayRow = {
    id: string
    status: JobStatus
    createdAt: Date | string
    // Postgres keeps microseconds and a JS Date only milliseconds; the writer reads both.
    createdAtMicros?: string | bigint
}

function compareCreatedAt(a: ReplayRow, b: ReplayRow): number {
    if (a.createdAtMicros !== undefined && b.createdAtMicros !== undefined) {
        const diff = BigInt(a.createdAtMicros) - BigInt(b.createdAtMicros)
        return diff === BigInt(0) ? 0 : diff < BigInt(0) ? -1 : 1
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

export const sortJobStatusRows = <T extends ReplayRow>(rows: readonly T[]): T[] =>
    [...rows].sort(
        (a, b) =>
            compareCreatedAt(a, b) ||
            REPLAY_TIE_RANK.indexOf(a.status) - REPLAY_TIE_RANK.indexOf(b.status) ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )

// Only the writer orders rows; screens stay set-based (docs/study-screens-logic.md).
export function replayJobStatus(rows: readonly ReplayRow[]): {
    status: JobStatus | null
    changedAt: Date | string | null
} {
    let status: JobStatus | null = null
    let changedAt: Date | string | null = null
    for (const row of sortJobStatusRows(rows)) {
        if (row.status === status) continue
        const effect = status === null ? 'move' : (findTransition(status, row.status)?.effect ?? 'move')
        if (effect === 'move') {
            status = row.status
            changedAt = row.createdAt
        }
    }
    return { status, changedAt }
}
