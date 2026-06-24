import { describe, expect, it } from 'vitest'
import { db } from '@/database'
import { insertTestStudyJobData } from '@/tests/unit.helpers'
import { rawStudyStateForStudy } from './study-state-query'

describe('rawStudyStateForStudy', () => {
    it('returns the study with its jobs, statuses, and files', async () => {
        const { study, job } = await insertTestStudyJobData({ studyStatus: 'APPROVED', jobStatus: 'CODE-SUBMITTED' })
        // add a second status row on the same job so we assert the full set comes back
        await db.insertInto('jobStatusChange').values({ status: 'CODE-APPROVED', studyJobId: job.id }).execute()

        const raw = await rawStudyStateForStudy(study.id)
        expect(raw).not.toBeNull()
        expect(raw!.status).toBe('APPROVED')
        expect(raw!.jobs.length).toBeGreaterThanOrEqual(1)
        const allStatuses = raw!.jobs.flatMap((j) => j.statusChanges.map((c) => c.status))
        expect(allStatuses).toContain('CODE-SUBMITTED')
        expect(allStatuses).toContain('CODE-APPROVED')
    })

    it('returns null for an unknown study id', async () => {
        expect(await rawStudyStateForStudy('01900000-0000-7000-8000-0000000000ff')).toBeNull()
    })
})
