import { describe, expect, it } from 'vitest'
import {
    createEncryptedPackagingFailureLogZip,
    PACKAGING_FAILURE_FILENAME,
    PACKAGING_FAILURE_MESSAGE,
} from './fake-packaging-log'
import { readTestSupportFile } from '@/tests/unit.helpers'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util'
import { ResultsReader } from 'si-encryption/job-results/reader'

describe('createEncryptedPackagingFailureLogZip', () => {
    it('creates a decryptable zip containing the expected log contents', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)

        const zipBytes = await createEncryptedPackagingFailureLogZip([{ publicKey, fingerprint }])

        const privateKeyPem = await readTestSupportFile('private_key.pem')
        const privateKeyBuffer = pemToArrayBuffer(privateKeyPem)

        // Use a plain Uint8Array clone to avoid TS treating underlying buffer as ArrayBufferLike/SharedArrayBuffer.
        const zipClone = Uint8Array.from(zipBytes)
        const reader = new ResultsReader(new Blob([zipClone]), privateKeyBuffer, fingerprint)
        const files = await reader.extractFiles()

        expect(files).toHaveLength(1)
        expect(files[0].path).toBe(PACKAGING_FAILURE_FILENAME)
        const decoded = new TextDecoder().decode(new Uint8Array(files[0].contents))
        expect(decoded).toBe(PACKAGING_FAILURE_MESSAGE)
    })
})
