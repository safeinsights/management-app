import { db } from '@/database'
import {
    describe,
    expect,
    faker,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestUser,
    it,
    mockSessionWithTestData,
    readTestSupportFile,
} from '@/tests/unit.helpers'
import { unwrapAesKey } from 'si-encryption/job-results/crypto'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { buildSharedFiles } from './re-wrap-results'

describe('buildSharedFiles', () => {
    it('wraps each file key for the lab, and the lab private key opens it', async () => {
        const { org: enclave } = await mockSessionWithTestData({ orgType: 'enclave' })
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user: researcher } = await insertTestUser({ org: lab })

        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)
        await db
            .insertInto('userPublicKey')
            .values({ userId: researcher.id, publicKey: Buffer.from(publicKey), fingerprint })
            .execute()

        const { study } = await insertTestStudyJobData({ org: enclave, researcherId: researcher.id })
        await db.updateTable('study').set({ submittedByOrgId: lab.id }).where('id', '=', study.id).execute()

        const rawAesKey = crypto.getRandomValues(new Uint8Array(32)).buffer
        const [shared] = await buildSharedFiles(study.id, [
            {
                path: 'results.csv',
                contents: new ArrayBuffer(0),
                sourceId: 'file-1',
                fileType: 'APPROVED-RESULT',
                rawAesKey,
            },
        ])

        expect(shared.keys.map((key) => key.fingerprint)).toEqual([fingerprint])

        const privateKey = pemToArrayBuffer(await readTestSupportFile('private_key.pem'))
        const unwrapped = await unwrapAesKey(shared.keys[0].crypt, privateKey)
        expect(new Uint8Array(unwrapped.rawAesKey)).toEqual(new Uint8Array(rawAesKey))
    })
})
