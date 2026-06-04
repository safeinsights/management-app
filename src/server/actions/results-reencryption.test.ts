import { describe, expect, test } from 'vitest'
import {
    db,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestUser,
    mockSessionWithTestData,
    readTestSupportFile,
} from '@/tests/unit.helpers'
import { reEncryptApprovedFiles } from '@/lib/re-encrypt-results'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { fingerprintKeyData, generateKeyPair, pemToArrayBuffer } from 'si-encryption/util'

// End-to-end re-encryption at approve: a reviewer's browser re-encrypts an approved
// file for the enclave (reviewers) AND the submitting lab (researchers); the result
// must decrypt with the researcher's own — distinct — private key, and still with the
// reviewer's. Uses real crypto (no storage/reader mocks).
describe('approve re-encryption round trip', () => {
    test('re-encrypts an approved file so the researcher can decrypt it with their own key', async () => {
        // Enclave reviewer seeded with the real test keypair (public_key.pem / private_key.pem).
        const { org: enclave } = await mockSessionWithTestData({ orgType: 'enclave', useRealKeys: true })

        // Submitting lab + a researcher holding a *different* keypair.
        const lab = await insertTestOrg({ slug: 'lab-org', type: 'lab' })
        const { user: researcher } = await insertTestUser({ org: { id: lab.id, slug: lab.slug, type: 'lab' } })
        const researcherKeys = await generateKeyPair()
        await db
            .insertInto('userPublicKey')
            .values({
                userId: researcher.id,
                publicKey: Buffer.from(researcherKeys.exportedPublicKey),
                fingerprint: researcherKeys.fingerprint,
            })
            .executeTakeFirstOrThrow()

        // Study reviewed by the enclave, submitted by the lab. Passing researcherId avoids
        // seeding an extra (fake-key) enclave user, which would break ResultsWriter.
        const { study } = await insertTestStudyJobData({ org: enclave, researcherId: researcher.id })
        await db.updateTable('study').set({ submittedByOrgId: lab.id }).where('id', '=', study.id).execute()

        // Mirror exactly what the approve buttons do client-side.
        const plaintext = 'col1,col2\nsensitive,value'
        const [jobFile] = await reEncryptApprovedFiles(study.id, [
            {
                path: 'results.csv',
                contents: new TextEncoder().encode(plaintext).buffer as ArrayBuffer,
                sourceId: 'source-1',
                fileType: 'APPROVED-RESULT',
            },
        ])

        const decryptWith = async (privateKey: ArrayBuffer, fingerprint: string) => {
            const reader = new ResultsReader(new Blob([jobFile.contents]), privateKey, fingerprint)
            const [file] = await reader.extractFiles()
            return new TextDecoder().decode(new Uint8Array(file.contents))
        }

        // Researcher decrypts with their own key — the core Card 71 guarantee.
        expect(await decryptWith(researcherKeys.exportedPrivateKey, researcherKeys.fingerprint)).toBe(plaintext)

        // Reviewer retains access with the enclave (test) key.
        const reviewerPrivateKey = pemToArrayBuffer(await readTestSupportFile('private_key.pem'))
        const reviewerFingerprint = await fingerprintKeyData(pemToArrayBuffer(await readTestSupportFile('public_key.pem')))
        expect(await decryptWith(reviewerPrivateKey, reviewerFingerprint)).toBe(plaintext)
    })
})
