import { db, describe, expect, insertTestOrg, it, readTestSupportFile } from '@/tests/unit.helpers'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { DEFAULT_REF_IDS } from './refs'
import { encryptFiles, orgRecipients } from './encrypt'

describe('encryptFiles', () => {
    it('writes an archive the test private key can read, bound to the job', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)
        const jobId = '00000000-0000-4000-8000-000000010011'

        const archive = await encryptFiles(
            [{ name: 'results.csv', content: 'week,naps\n1,3\n' }],
            [{ fingerprint, publicKey }],
            jobId,
        )

        const privateKey = pemToArrayBuffer(await readTestSupportFile('private_key.pem'))
        const reader = new ResultsReader(new Blob([archive!.zip]), privateKey, fingerprint)
        const [file] = await reader.extractFiles()
        expect(new TextDecoder().decode(file.contents)).toBe('week,naps\n1,3\n')
        expect(reader.manifest.jobId).toBe(jobId)
        expect(archive!.keys['results.csv'][fingerprint]).toEqual(expect.any(String))
    })

    it('returns null when the org has no keys, so the study is written without the file', async () => {
        expect(await encryptFiles([{ name: 'results.csv', content: 'x' }], [], 'job')).toBeNull()
    })
})

describe('orgRecipients', () => {
    it('returns one recipient per fingerprint for the enclave members', async () => {
        const recipients = await orgRecipients(db, [DEFAULT_REF_IDS.enclaveId])
        const fingerprints = recipients.map((r) => r.fingerprint)
        expect(fingerprints.length).toBeGreaterThan(0)
        expect(new Set(fingerprints).size).toBe(fingerprints.length)
    })

    it('leaves out a member whose key cannot be imported, so one bad key does not block the archive', async () => {
        const org = await insertTestOrg()
        const user = await db
            .insertInto('user')
            .values({ clerkId: `bad-key-${org.id}`, firstName: 'Bad', lastName: 'Key' })
            .returning('id')
            .executeTakeFirstOrThrow()
        await db.insertInto('orgUser').values({ userId: user.id, orgId: org.id, isAdmin: false }).execute()
        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: Buffer.from('testPublicKey'), fingerprint: `bad-${org.id}` })
            .execute()

        expect(await orgRecipients(db, [org.id])).toEqual([])
    })
})
