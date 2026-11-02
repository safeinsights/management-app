import type { StudyJobStatus } from '@/database/types'
import { replayJobStatus } from '@/lib/job-status-rules'
import type { RawJob } from '@/lib/study-screen'

// A RawJob for pure projection tests. Its current status is the replay of `statuses` in order, as the
// status writer would have stored it.
export const rawJob = (id: string, statuses: readonly string[], round = 1): RawJob => ({
    id,
    round,
    currentStatus:
        replayJobStatus(
            statuses.map((status, index) => ({
                id: String(index),
                status: status as StudyJobStatus,
                createdAt: new Date(index * 1000),
            })),
        ).status ?? 'INITIATED',
    statusChanges: statuses.map((status) => ({ status: status as StudyJobStatus })),
})

// Raw job histories for the job state parity test: each inner list is one job, oldest row first.
export type JobHistory = { name: string; jobs: StudyJobStatus[][] }

const SUBMITTED: StudyJobStatus[] = ['INITIATED', 'CODE-SUBMITTED']
const APPROVED: StudyJobStatus[] = [...SUBMITTED, 'CODE-APPROVED', 'JOB-READY']
const COMPLETE: StudyJobStatus[] = [...APPROVED, 'JOB-RUNNING', 'RUN-COMPLETE']

export const JOB_HISTORIES: JobHistory[] = [
    { name: 'a baseline job only', jobs: [['INITIATED']] },
    { name: 'submitted code', jobs: [SUBMITTED] },
    { name: 'scanned code', jobs: [[...SUBMITTED, 'CODE-SCANNED']] },
    { name: 'a pending resubmission', jobs: [[...SUBMITTED, 'CODE-SCANNED', 'CODE-CHANGES-REQUESTED']] },
    { name: 'resubmitted code', jobs: [[...SUBMITTED, 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED']] },
    { name: 'a scan error', jobs: [[...SUBMITTED, 'JOB-ERRORED']] },
    { name: 'approved after a scan error', jobs: [[...SUBMITTED, 'JOB-ERRORED', 'CODE-APPROVED', 'JOB-READY']] },
    { name: 'packaging', jobs: [[...SUBMITTED, 'CODE-APPROVED', 'JOB-PACKAGING']] },
    { name: 'running', jobs: [[...APPROVED, 'JOB-PROVISIONING', 'JOB-RUNNING']] },
    { name: 'a late scan and stage report', jobs: [[...APPROVED, 'JOB-RUNNING', 'CODE-SCANNED', 'JOB-PROVISIONING']] },
    { name: 'a run error', jobs: [[...APPROVED, 'JOB-RUNNING', 'JOB-ERRORED']] },
    { name: 'a complete run', jobs: [COMPLETE] },
    { name: 'shared outputs', jobs: [[...COMPLETE, 'FILES-APPROVED']] },
    { name: 'feedback only', jobs: [[...COMPLETE, 'FILES-REJECTED']] },
    { name: 'viewed outputs', jobs: [[...COMPLETE, 'FILES-APPROVED', 'RESULTS-VIEWED']] },
    { name: 'shared errored outputs', jobs: [[...APPROVED, 'JOB-ERRORED', 'FILES-APPROVED']] },
    { name: 'contradictory legacy decisions', jobs: [[...COMPLETE, 'FILES-APPROVED', 'FILES-REJECTED']] },
    { name: 'a late scan after the outputs decision', jobs: [[...COMPLETE, 'FILES-REJECTED', 'CODE-SCANNED']] },
    { name: 'a rejected code submission', jobs: [[...SUBMITTED, 'CODE-REJECTED']] },
    { name: 'a decided round and a baseline job', jobs: [[...COMPLETE, 'FILES-REJECTED'], ['INITIATED']] },
    { name: 'a decided round and new code', jobs: [[...COMPLETE, 'FILES-REJECTED'], SUBMITTED] },
    {
        name: 'two decided rounds and a third run',
        jobs: [
            [...COMPLETE, 'FILES-REJECTED'],
            [...COMPLETE, 'FILES-APPROVED'],
            [...SUBMITTED, 'CODE-APPROVED', 'JOB-READY'],
        ],
    },
    { name: 'two baseline jobs', jobs: [['INITIATED'], ['INITIATED']] },
]
