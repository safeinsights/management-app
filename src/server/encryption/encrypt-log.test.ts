import { describe, expect, it } from 'vitest'
import { createEncryptedLogZip, LOG_FILENAME } from './encrypt-log'
import { readTestSupportFile } from '@/tests/unit.helpers'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util'
import { ResultsReader } from 'si-encryption/job-results/reader'

describe('createEncryptedLogZip', () => {
    it('creates a decryptable zip containing the expected log contents', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)

        const message = 'Build failed during code packaging'
        const zipBytes = await createEncryptedLogZip(message, [{ publicKey, fingerprint }])

        const privateKeyPem = await readTestSupportFile('private_key.pem')
        const privateKeyBuffer = pemToArrayBuffer(privateKeyPem)

        // Use a plain Uint8Array clone to avoid TS treating underlying buffer as ArrayBufferLike/SharedArrayBuffer.
        const zipClone = Uint8Array.from(zipBytes)
        const reader = new ResultsReader(new Blob([zipClone]), privateKeyBuffer, fingerprint)
        const files = await reader.extractFiles()

        expect(files).toHaveLength(1)
        expect(files[0].path).toBe(LOG_FILENAME)
        const decoded = new TextDecoder().decode(new Uint8Array(files[0].contents))
        expect(decoded).toBe(message)
    })
})
