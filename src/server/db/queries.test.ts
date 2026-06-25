import { describe, expect, it } from 'vitest'
import {
    BLANK_UUID,
    insertTestDataSource,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestStudyJobUsers,
    readTestSupportFile,
} from '@/tests/unit.helpers'
import { db } from '@/database'
import {
    codeSubmissionVersion,
    currentReviewVersion,
    getStudyReviewForJob,
    getOrgIdForJobId,
    getOrgPublicKeys,
    getOrgPublicKeysRaw,
    getUserPublicKey,
    getUsersForOrgId,
    jobInfoForJobId,
    studyInfoForStudyId,
    getDataSourcesForOrg,
    getSharedFileIdsForJob,
} from './queries'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { ResultsReader } from 'si-encryption/job-results/reader'

async function insertRecords() {
    const org1 = await insertTestOrg({ slug: 'test-org-1' })
    const org2 = await insertTestOrg({ slug: 'test-org-2' })
    const {
        user1: org1User1,
        user2: org1User2,
        job: job1,
        study: study1,
    } = await insertTestStudyJobUsers({ org: org1 })
    const {
        user1: org2User1,
        user2: org2User2,
        job: job2,
        study: study2,
    } = await insertTestStudyJobUsers({ org: org2 })

    return {
        study1,
        study2,
        job1,
        job2,
        org1,
        org2,
        org1User1,
        org1User2,
        org2User1,
        org2User2,
    }
}

describe('getUserPublicKey', () => {
    it('returns public key when userId is valid', async () => {
        const { org1User1 } = await insertRecords()
        const publicKey = await getUserPublicKey(org1User1.id)
        expect(publicKey).not.toBeNull()
    })

    it('returns null when userId is invalid', async () => {
        const publicKey = await getUserPublicKey(BLANK_UUID)
        expect(publicKey).toBeUndefined()
    })
})

describe('jobInfoForJobId', () => {
    it('returns job info when jobId is valid', async () => {
        const { job1, org1 } = await insertRecords()
        const jobInfo = await jobInfoForJobId(job1.id)
        expect(jobInfo).not.toBeNull()
        expect(jobInfo?.studyJobId).toBe(job1.id)
        expect(jobInfo?.orgSlug).toBe(org1.slug)
    })
})

describe('studyInfoForStudyId', () => {
    it('returns study info when studyId is valid', async () => {
        const { study1, org1 } = await insertRecords()
        const studyInfo = await studyInfoForStudyId(study1.id)
        expect(studyInfo).not.toBeNull()
        expect(studyInfo?.studyId).toBe(study1.id)
        expect(studyInfo?.orgSlug).toBe(org1.slug)
    })

    it('returns null when studyId is invalid', async () => {
        const studyInfo = await studyInfoForStudyId(BLANK_UUID)
        expect(studyInfo).toBeUndefined()
    })
})

describe('getUsersForOrgId', () => {
    it('returns users for an org', async () => {
        const { org1, org1User1 } = await insertRecords()
        const users = await getUsersForOrgId(org1.id)
        expect(users).not.toBeNull()
        expect(users.length).toBeGreaterThan(0)
        const userIds = users.map((u) => u.id)
        expect(userIds).toContain(org1User1.id)
    })

    it('returns empty array when orgId is invalid', async () => {
        const users = await getUsersForOrgId(BLANK_UUID)
        expect(users).toEqual([])
    })
})

describe('getOrgIdForJobId', () => {
    it('returns orgId when jobId is valid', async () => {
        const { job1, org1 } = await insertRecords()
        const orgId = await getOrgIdForJobId(job1.id)
        expect(orgId).toBe(org1.id)
    })

    it('returns undefined when jobId is invalid', async () => {
        const orgId = await getOrgIdForJobId(BLANK_UUID)
        expect(orgId).toBeUndefined()
    })
})

describe('getOrgPublicKeysRaw', () => {
    it('returns public keys with Buffer format for org users', async () => {
        const { org1 } = await insertRecords()
        const keys = await getOrgPublicKeysRaw(org1.id)

        expect(keys.length).toBeGreaterThan(0)
        keys.forEach((key) => {
            expect(key.publicKey).toBeInstanceOf(Buffer)
            expect(typeof key.fingerprint).toBe('string')
        })
    })

    it('returns empty array when orgId is invalid', async () => {
        const keys = await getOrgPublicKeysRaw(BLANK_UUID)
        expect(keys).toEqual([])
    })
})

describe('getOrgPublicKeys', () => {
    it('returns public keys with ArrayBuffer format for org users', async () => {
        const { org1 } = await insertRecords()
        const keys = await getOrgPublicKeys(org1.id)

        expect(keys.length).toBeGreaterThan(0)
        keys.forEach((key) => {
            expect(key.publicKey).toBeInstanceOf(ArrayBuffer)
            expect(typeof key.fingerprint).toBe('string')
        })
    })

    it('returns empty array when orgId is invalid', async () => {
        const keys = await getOrgPublicKeys(BLANK_UUID)
        expect(keys).toEqual([])
    })

    it('produces keys that can be used for encryption round-trip', async () => {
        const org = await insertTestOrg({ slug: 'test-org-encryption' })
        await insertTestStudyJobUsers({ org, useRealKeys: true })

        // Get expected fingerprint from the test key file
        const publicKeyPem = await readTestSupportFile('public_key.pem')
        const publicKeyArrayBuffer = pemToArrayBuffer(publicKeyPem)
        const fingerprint = await fingerprintKeyData(publicKeyArrayBuffer)

        // Get keys using the function under test
        const keys = await getOrgPublicKeys(org.id)
        expect(keys.length).toBeGreaterThan(0)

        // Encrypt a message using the keys
        const message = 'Test encryption message'
        const writer = new ResultsWriter(keys)
        const bytes = new TextEncoder().encode(message)
        await writer.addFile('test.txt', bytes.buffer)
        const encryptedBlob = await writer.generate()

        // Decrypt and verify
        const privateKeyPem = await readTestSupportFile('private_key.pem')
        const privateKeyBuffer = pemToArrayBuffer(privateKeyPem)
        const reader = new ResultsReader(encryptedBlob, privateKeyBuffer, fingerprint)
        const files = await reader.extractFiles()

        expect(files).toHaveLength(1)
        expect(files[0].path).toBe('test.txt')
        const decoded = new TextDecoder().decode(new Uint8Array(files[0].contents))
        expect(decoded).toBe(message)
    })
})

describe('currentReviewVersion', () => {
    it('returns 1 when no studyProposalComment rows exist (cold round 1)', async () => {
        const { study1 } = await insertRecords()
        await expect(currentReviewVersion(study1.id)).resolves.toBe(1)
    })

    it('returns max(version) across rows of mixed entryTypes', async () => {
        const { study1, org1User1 } = await insertRecords()
        await db
            .insertInto('studyProposalComment')
            .values([
                {
                    studyId: study1.id,
                    authorId: org1User1.id,
                    authorRole: 'REVIEWER',
                    entryType: 'REVIEWER-FEEDBACK',
                    body: { root: { type: 'root' } },
                    version: 1,
                },
                {
                    studyId: study1.id,
                    authorId: org1User1.id,
                    authorRole: 'RESEARCHER',
                    entryType: 'RESUBMISSION-NOTE',
                    body: { root: { type: 'root' } },
                    version: 2,
                },
            ])
            .execute()
        await expect(currentReviewVersion(study1.id)).resolves.toBe(2)
    })

    it('is tie-immune when multiple reviewers share a version', async () => {
        const { study1, org1User1, org1User2 } = await insertRecords()
        await db
            .insertInto('studyProposalComment')
            .values([
                {
                    studyId: study1.id,
                    authorId: org1User1.id,
                    authorRole: 'REVIEWER',
                    entryType: 'REVIEWER-FEEDBACK',
                    body: { root: { type: 'root' } },
                    version: 1,
                },
                {
                    studyId: study1.id,
                    authorId: org1User2.id,
                    authorRole: 'REVIEWER',
                    entryType: 'REVIEWER-FEEDBACK',
                    body: { root: { type: 'root' } },
                    version: 1,
                },
            ])
            .execute()
        await expect(currentReviewVersion(study1.id)).resolves.toBe(1)
    })

    it('does not leak versions from other studies', async () => {
        const { study1, study2, org2User1 } = await insertRecords()
        await db
            .insertInto('studyProposalComment')
            .values({
                studyId: study2.id,
                authorId: org2User1.id,
                authorRole: 'REVIEWER',
                entryType: 'REVIEWER-FEEDBACK',
                body: { root: { type: 'root' } },
                version: 3,
            })
            .execute()
        await expect(currentReviewVersion(study1.id)).resolves.toBe(1)
    })
})

describe('getSharedFileIdsForJob', () => {
    const insertFile = (jobId: string, fileType: 'ENCRYPTED-RESULT' | 'ENCRYPTED-CODE-RUN-LOG') =>
        db
            .insertInto('studyJobFile')
            .values({
                studyJobId: jobId,
                name: 'encrypted-results.zip',
                path: `results/${fileType}.zip`,
                fileType,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

    // Sharing = a re-wrapped key row for the artifact. This is what getSharedFileIdsForJob reads,
    // so tests grant access by inserting these rows rather than flipping a status.
    const shareFile = (studyJobFileId: string, filePath: string, fingerprint: string) =>
        db
            .insertInto('studyJobFileRecipientKey')
            .values({ studyJobFileId, filePath, fingerprint, crypt: 'wrapped-key' })
            .execute()

    it('returns [] when nothing has been shared', async () => {
        const { job } = await insertTestStudyJobData()
        await insertFile(job.id, 'ENCRYPTED-RESULT')
        expect(await getSharedFileIdsForJob(job.id)).toEqual([])
    })

    it('returns each artifact that has a re-wrapped key, results and logs alike', async () => {
        const { job } = await insertTestStudyJobData()
        const result = await insertFile(job.id, 'ENCRYPTED-RESULT')
        const log = await insertFile(job.id, 'ENCRYPTED-CODE-RUN-LOG')
        await shareFile(result.id, 'results.csv', 'fp-researcher')
        await shareFile(log.id, 'run.log', 'fp-researcher')

        const ids = await getSharedFileIdsForJob(job.id)
        expect(ids.sort()).toEqual([result.id, log.id].sort())
    })

    // The query reports exactly the artifacts with key rows, so a file that exists but was never
    // re-wrapped is not "shared". (All-or-nothing approval shares results + logs together, but the
    // query stays correct for any subset — keeping the door open to splitting them later.)
    it('excludes artifacts that have no re-wrapped key', async () => {
        const { job } = await insertTestStudyJobData()
        const result = await insertFile(job.id, 'ENCRYPTED-RESULT')
        await insertFile(job.id, 'ENCRYPTED-CODE-RUN-LOG') // present but not re-wrapped
        await shareFile(result.id, 'results.csv', 'fp-researcher')

        expect(await getSharedFileIdsForJob(job.id)).toEqual([result.id])
    })

    it('returns an artifact once even when shared with multiple researchers', async () => {
        const { job } = await insertTestStudyJobData()
        const result = await insertFile(job.id, 'ENCRYPTED-RESULT')
        await shareFile(result.id, 'results.csv', 'fp-a')
        await shareFile(result.id, 'results.csv', 'fp-b')

        expect(await getSharedFileIdsForJob(job.id)).toEqual([result.id])
    })

    // Sharing is recorded by the key rows, independent of current org membership. Removing a
    // researcher from the lab must NOT delete their key rows / retroactively un-share. This guards
    // against anyone reintroducing a membership join here.
    it('stays shared after the lab researchers are removed from the org', async () => {
        const { org, job } = await insertTestStudyJobData()
        const result = await insertFile(job.id, 'ENCRYPTED-RESULT')
        await shareFile(result.id, 'results.csv', 'fp-researcher')

        await db.deleteFrom('orgUser').where('orgId', '=', org.id).execute()

        expect(await getSharedFileIdsForJob(job.id)).toEqual([result.id])
    })
})

describe('getStudyReviewForJob', () => {
    it('returns null when no review exists for the job', async () => {
        const { job } = await insertTestStudyJobData()
        const result = await getStudyReviewForJob(job.id)
        expect(result).toBeNull()
    })

    it('returns the review with meta when a row exists', async () => {
        const { job } = await insertTestStudyJobData()
        const report = {
            proposalSummary: 'Studying student outcomes.',
            codeExplanation: 'Aggregates scores by school.',
            alignmentCheck: { isAligned: true, findings: [] },
            complianceCheck: { isCompliant: true, findings: [] },
        }
        await db
            .insertInto('studyReview')
            .values({ studyJobId: job.id, report: JSON.stringify(report) })
            .execute()

        const result = await getStudyReviewForJob(job.id)
        if (!result) throw new Error('expected review')
        expect(result.report).toEqual(report)
        expect(result.createdAt).toBeInstanceOf(Date)
        expect(result.files).toEqual([])
    })
})

describe('getDataSourcesForOrg', () => {
    it('returns data source and URLs', async () => {
        const org = await insertTestOrg()
        const dataSource1 = {
            name: 'Name: Data source 1',
            description: 'Desc: Data source 1',
            urls: [
                {
                    url: 'https://example.com/url1',
                    description: 'Source 1 url1 desc',
                },
                {
                    url: 'https://example.com/url2',
                    description: 'Source 1 url2 desc',
                },
            ],
        }

        const dataSource2 = {
            name: 'Name: Data source 2',
            description: null,
            urls: [
                {
                    url: 'https://example.com/url3',
                    description: null,
                },
                {
                    url: null,
                    description: null,
                },
            ],
        }

        await insertTestDataSource({
            orgId: org.id,
            ...dataSource1,
        })

        await insertTestDataSource({
            orgId: org.id,
            ...dataSource2,
        })

        const result = await getDataSourcesForOrg(org.id)

        expect(result.length).toEqual(2)

        const resDataSource1 = result[0]
        const resDataSource2 = result[1]

        expect(resDataSource1.name).toEqual(dataSource1.name)
        expect(resDataSource1.description).toEqual(dataSource1.description)
        expect(resDataSource1.urls).toStrictEqual(dataSource1.urls)
        expect(resDataSource2.name).toEqual(dataSource2.name)
        expect(resDataSource2.description).toEqual(dataSource2.description)
        expect(resDataSource2.urls).toStrictEqual(dataSource2.urls)
    })
})

describe('codeSubmissionVersion', () => {
    it('v1 for first submission, v2 after a change request on the same job', async () => {
        const { study, job } = await insertTestStudyJobData({
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        expect(await codeSubmissionVersion(study.id)).toBe(1)
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status: 'CODE-CHANGES-REQUESTED' })
            .execute()
        expect(await codeSubmissionVersion(study.id)).toBe(2)
    })

    it('v3 after two change-request rounds on the same job', async () => {
        const { study, job } = await insertTestStudyJobData({
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db
            .insertInto('jobStatusChange')
            .values([
                { studyJobId: job.id, status: 'CODE-CHANGES-REQUESTED' },
                { studyJobId: job.id, status: 'CODE-SUBMITTED' },
                { studyJobId: job.id, status: 'CODE-CHANGES-REQUESTED' },
                { studyJobId: job.id, status: 'CODE-SUBMITTED' },
            ])
            .execute()
        expect(await codeSubmissionVersion(study.id)).toBe(3)
    })

    // The version counts round-opening events (CODE-CHANGES-REQUESTED / FILES-*), not CODE-SUBMITTED,
    // so it's unaffected by how many CODE-SUBMITTED rows a round accumulates — a duplicate from a
    // concurrent submit can't inflate the version.
    it('is unaffected by extra CODE-SUBMITTED rows with no new round', async () => {
        const { study, job } = await insertTestStudyJobData({
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'CODE-SUBMITTED' }).execute()
        expect(await codeSubmissionVersion(study.id)).toBe(1)
    })

    // Monotonic across jobs (OTTER-556/558): a results decision opens a fresh job, and the next
    // submission must keep climbing (v2), NOT reset to v1 — otherwise the resubmission is mislabelled
    // and prior feedback is hidden on the read-only screens.
    it('keeps climbing across a results-decision round boundary', async () => {
        const { study, job: firstJob } = await insertTestStudyJobData({
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        // First round runs and is rejected at the results stage (closes the round, opens a new job).
        await db.insertInto('jobStatusChange').values({ studyJobId: firstJob.id, status: 'FILES-REJECTED' }).execute()
        expect(await codeSubmissionVersion(study.id)).toBe(2)

        // The researcher resubmits → a brand-new job with its own first CODE-SUBMITTED.
        const newJob = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()
        await db.insertInto('jobStatusChange').values({ studyJobId: newJob.id, status: 'CODE-SUBMITTED' }).execute()

        // Still v2 (one round boundary so far), and rises to v3 on the next change request.
        expect(await codeSubmissionVersion(study.id)).toBe(2)
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: newJob.id, status: 'CODE-CHANGES-REQUESTED' })
            .execute()
        expect(await codeSubmissionVersion(study.id)).toBe(3)
    })
})
