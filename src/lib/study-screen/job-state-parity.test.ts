import { db, describe, expect, insertTestStudyOnly, it } from '@/tests/unit.helpers'
import { JOB_HISTORIES } from '@/tests/unit/job-histories'
import { legacyProjectStudyState } from '@/tests/unit/legacy-study-state'
import { openStudyJob, writeJobStatus } from '@/database/job-status-writer'
import { backfillStudyJobState } from '@/database/migrations/1787900000000_study_job_current_status'
import type { Kysely } from 'kysely'
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
    return { raw, studyId: study.id }
}

const jobColumns = (studyId: string) =>
    db
        .selectFrom('studyJob')
        .select(['id', 'currentStatus', 'round', 'statusChangedAt'])
        .where('studyId', '=', studyId)
        .orderBy('id')
        .execute()

// The projection before OTTER-973 is the oracle: moving job state onto stored columns must not change
// a single fact or the screen either role is routed to.
describe('job state parity with the projection before OTTER-973', () => {
    it.each(JOB_HISTORIES)('agrees for $name', async ({ jobs }) => {
        const { raw } = await seedHistory(jobs)
        const legacy = legacyProjectStudyState(raw)
        const current = projectStudyState(raw)

        expect(current).toEqual(legacy)
        for (const role of ['researcher', 'reviewer'] as const) {
            expect(resolveScreen(role, current)).toEqual(resolveScreen(role, legacy as StudyState))
        }
    })
})

// The writer keeps the columns as it goes; the migration and the recompute script rebuild them from the log.
describe('the status writer and the backfill', () => {
    it.each(JOB_HISTORIES)('store the same job state for $name', async ({ jobs }) => {
        const { studyId } = await seedHistory(jobs)
        const written = await jobColumns(studyId)

        await backfillStudyJobState(db as unknown as Kysely<unknown>, { jobIds: written.map((job) => job.id) })

        expect(await jobColumns(studyId)).toEqual(written)
    })
})
