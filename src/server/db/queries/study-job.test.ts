import { describe, expect, it } from 'vitest'
import { insertTestLaterJob, insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { seedJobFileRow } from '@/tests/artifact.helpers'
import { latestSubmittedJobForStudy } from './study-job'

// OTTER-882: the reviewer's code run card reads this job, so an earlier run's files must never ride along.
describe('latestSubmittedJobForStudy', () => {
    it('returns the latest run with only its own files', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job: earlierJob } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        await seedJobFileRow(earlierJob.id, 'ENCRYPTED-RESULT', 'encrypted-results.zip')
        const latestJob = await insertTestLaterJob(study.id, ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE'])
        const latestFile = await seedJobFileRow(latestJob.id, 'ENCRYPTED-RESULT', 'encrypted-results.zip')

        const job = await latestSubmittedJobForStudy(study.id)

        expect(job?.id).toBe(latestJob.id)
        expect(job?.files.map((file) => file.id)).toEqual([latestFile.id])
    })
})
