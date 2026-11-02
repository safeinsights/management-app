import { db, describe, expect, insertTestStudyOnly, it } from '@/tests/unit.helpers'
import { JOB_HISTORIES } from '@/tests/unit/job-histories'
import { legacyProjectStudyState } from '@/tests/unit/legacy-study-state'
import { openStudyJob, writeJobStatus } from '@/database/job-status-writer'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { projectStudyState } from './state'
import { resolveScreen } from './resolve'
import type { StudyState } from './state.types'

const BASE = new Date('2026-01-01T00:00:00Z').getTime()

// Written through the status writer, which is how every job gets its rows and columns now.
const seedHistory = async (jobs: (typeof JOB_HISTORIES)[number]['jobs']) => {
    const { study } = await insertTestStudyOnly()
    let second = 0
    for (const statuses of jobs) {
        const [first, ...rest] = statuses
        const job = await openStudyJob(db, study.id, { actor: 'qa', at: new Date(BASE + second++ * 1000) })
        if (first !== 'INITIATED')
            await writeJobStatus(db, job.id, first, { actor: 'qa', at: new Date(BASE + second++ * 1000) })
        for (const status of rest) {
            await writeJobStatus(db, job.id, status, { actor: 'qa', at: new Date(BASE + second++ * 1000) })
        }
    }
    const raw = await rawStudyStateForStudy(study.id, db)
    if (!raw) throw new Error('no raw state')
    return raw
}

// The projection before OTTER-973 is the oracle: moving job state onto stored columns must not change
// a single fact or the screen either role is routed to.
describe('job state parity with the projection before OTTER-973', () => {
    it.each(JOB_HISTORIES)('agrees for $name', async ({ jobs }) => {
        const raw = await seedHistory(jobs)
        const legacy = legacyProjectStudyState(raw)
        const current = projectStudyState(raw)

        expect(current).toEqual(legacy)
        for (const role of ['researcher', 'reviewer'] as const) {
            expect(resolveScreen(role, current)).toEqual(resolveScreen(role, legacy as StudyState))
        }
    })
})
