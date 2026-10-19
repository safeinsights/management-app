import { NotFoundError } from '@/lib/errors'
import { describe, expect, insertTestOrg, insertTestStudyJobData, it } from '@/tests/unit.helpers'
import {
    withReviewerStudyJobSubject,
    withStudyAccessSubject,
    withStudyJobSubject,
    withStudySubject,
} from './study-subject'

const UNKNOWN_ID = '00000000-0000-7000-8000-000000000000'

async function seedJob() {
    const enclave = await insertTestOrg({ slug: 'subject-enclave', type: 'enclave' })
    const lab = await insertTestOrg({ slug: 'subject-lab', type: 'lab' })
    const { study, job } = await insertTestStudyJobData({ org: enclave, submittedByOrg: lab, title: 'Secret title' })
    return { enclave, lab, study, job }
}

describe('withStudyJobSubject', () => {
    it('returns ids and the study status only, for either param name', async () => {
        const { enclave, lab, study, job } = await seedJob()
        const expected = {
            orgId: enclave.id,
            orgSlug: enclave.slug,
            studyId: study.id,
            studyJobId: job.id,
            submittedByOrgId: lab.id,
            status: study.status,
        }

        expect(await withStudyJobSubject({ params: { jobId: job.id } })).toStrictEqual(expected)
        expect(await withStudyJobSubject({ params: { studyJobId: job.id } })).toStrictEqual(expected)
    })

    it('rejects an unknown job with the existing not-found text', async () => {
        const result = withStudyJobSubject({ params: { studyJobId: UNKNOWN_ID } })
        await expect(result).rejects.toBeInstanceOf(NotFoundError)
        await expect(result).rejects.toThrow(`job for study job id ${UNKNOWN_ID} was not found`)
    })
})

describe('withReviewerStudyJobSubject', () => {
    it('leaves out submittedByOrgId', async () => {
        const { enclave, study, job } = await seedJob()

        expect(await withReviewerStudyJobSubject({ params: { jobId: job.id } })).toStrictEqual({
            orgId: enclave.id,
            orgSlug: enclave.slug,
            studyId: study.id,
            studyJobId: job.id,
            status: study.status,
        })
    })
})

describe('withStudySubject', () => {
    it('rejects an unknown study with a not-found error', async () => {
        const result = withStudySubject({ params: { studyId: UNKNOWN_ID } })
        await expect(result).rejects.toBeInstanceOf(NotFoundError)
        await expect(result).rejects.toThrow('study was not found')
    })
})

describe('withStudyAccessSubject', () => {
    it('returns orgId, submittedByOrgId and status only', async () => {
        const { enclave, lab, study } = await seedJob()

        expect(await withStudyAccessSubject({ params: { studyId: study.id } })).toStrictEqual({
            orgId: enclave.id,
            submittedByOrgId: lab.id,
            status: study.status,
        })
    })

    it('rejects an unknown study', async () => {
        await expect(withStudyAccessSubject({ params: { studyId: UNKNOWN_ID } })).rejects.toThrow('study was not found')
    })
})
