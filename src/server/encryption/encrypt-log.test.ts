import { describe, expect, it } from 'vitest'
import { createEncryptedLogBlob, LOG_FILENAME } from './encrypt-log'
import { readTestSupportFile } from '@/tests/unit.helpers'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util'
import { ResultsReader } from 'si-encryption/job-results/reader'

describe('createEncryptedLogBlob', () => {
    it('creates a decryptable zip containing the expected log contents', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)

        const message = 'Build failed during code packaging'
        const zipBlob = await createEncryptedLogBlob(message, [{ publicKey, fingerprint }])

        const privateKeyPem = await readTestSupportFile('private_key.pem')
        const privateKeyBuffer = pemToArrayBuffer(privateKeyPem)

        const reader = new ResultsReader(zipBlob, privateKeyBuffer, fingerprint)
        const files = await reader.extractFiles()

        expect(files).toHaveLength(1)
        expect(files[0].path).toBe(LOG_FILENAME)
        const decoded = new TextDecoder().decode(new Uint8Array(files[0].contents))
        expect(decoded).toBe(message)
    })
})
