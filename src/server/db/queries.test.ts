import { describe, expect, it } from 'vitest'
import { insertTestOrg, insertTestStudyJobUsers, readTestSupportFile } from '@/tests/unit.helpers'
import {
    getOrgIdForJobId,
    getOrgPublicKeys,
    getOrgPublicKeysRaw,
    getReviewerPublicKey,
    getUsersForOrgId,
    jobInfoForJobId,
    studyInfoForStudyId,
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

const invalidUUID = '00000000-0000-0000-0000-000000000000'

describe('getReviewerPublicKey', () => {
    it('returns public key when userId is valid', async () => {
        const { org1User1 } = await insertRecords()
        const publicKey = await getReviewerPublicKey(org1User1.id)
        expect(publicKey).not.toBeNull()
    })

    it('returns null when userId is invalid', async () => {
        const publicKey = await getReviewerPublicKey(invalidUUID)
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
        const studyInfo = await studyInfoForStudyId(invalidUUID)
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
        const users = await getUsersForOrgId(invalidUUID)
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
        const orgId = await getOrgIdForJobId(invalidUUID)
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
        const keys = await getOrgPublicKeysRaw(invalidUUID)
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
        const keys = await getOrgPublicKeys(invalidUUID)
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
