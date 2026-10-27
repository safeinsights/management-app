import type { APIRequestContext } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import { loadEncryption } from './encryption'

// The key pair local dev and the seeds give the `openstax` org (bin/seed-environment.ts), so a token
// signed here verifies against org.settings.publicKey the way a real enclave's does.
const SUPPORT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'support')
export const ENCLAVE_PRIVATE_KEY_FILE = path.join(SUPPORT_DIR, 'private_key.pem')
export const ENCLAVE_PUBLIC_KEY_FILE = path.join(SUPPORT_DIR, 'public_key.pem')

export const DEFAULT_ENCLAVE_SLUG = 'openstax'

// The statuses PUT /api/job/:id accepts from an enclave.
export type EnclaveJobStatus =
    | 'JOB-PROVISIONING'
    | 'JOB-RUNNING'
    | 'JOB-ERRORED'
    | 'FILES-APPROVED'
    | 'FILES-REJECTED'
    | 'RUN-COMPLETE'

export type EnclaveClientOptions = {
    orgSlug?: string
    privateKeyFile?: string
}

// RS256, `iss` = the enclave org's slug, one hour: what src/server/org-from-auth-token.ts verifies.
export function enclaveBearer({ orgSlug = DEFAULT_ENCLAVE_SLUG, privateKeyFile = ENCLAVE_PRIVATE_KEY_FILE } = {}) {
    const payload = { iss: orgSlug, exp: Math.floor(Date.now() / 1000) + 60 * 60 }
    return `Bearer ${jwt.sign(payload, fs.readFileSync(privateKeyFile, 'utf8'), { algorithm: 'RS256' })}`
}

export type EncryptedUpload = { name: string; mimeType: string; buffer: Buffer }

// Encrypts one file the way the enclave's Trusted Output App does, for every key that may open it.
// Defaults to the test key every seeded user holds, so the reviewer and researcher flows decrypt with
// tests/support/private_key.pem.
export async function encryptForKeys(
    filePath: string,
    jobId: string,
    publicKeyPems: string[] = [fs.readFileSync(ENCLAVE_PUBLIC_KEY_FILE, 'utf8')],
): Promise<EncryptedUpload> {
    const { ResultsWriter, pemToArrayBuffer, fingerprintKeyData } = await loadEncryption()
    const keys = await Promise.all(
        publicKeyPems.map(async (pem) => {
            const publicKey = pemToArrayBuffer(pem)
            return { fingerprint: await fingerprintKeyData(publicKey), publicKey }
        }),
    )
    const writer = new ResultsWriter(keys, { jobId })
    const bytes = fs.readFileSync(filePath)
    await writer.addFile(
        path.basename(filePath),
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )
    const zip = await writer.generate()
    return { name: path.basename(filePath), mimeType: 'application/zip', buffer: Buffer.from(await zip.arrayBuffer()) }
}

export type UploadFiles = { resultFile?: string; logFile?: string }

// The enclave side of the job API, in-process. Every method returns the raw response so a spec
// asserts the status and body it cares about; nothing here throws on a non-2xx.
export function createEnclaveClient(request: APIRequestContext, options: EnclaveClientOptions = {}) {
    const headers = () => ({ Authorization: enclaveBearer(options) })

    return {
        readyStudies: () => request.get('/api/studies/ready', { headers: headers() }),
        jobStatus: (jobId: string) => request.get(`/api/job/${jobId}/status`, { headers: headers() }),
        jobKeys: (jobId: string) => request.get(`/api/job/${jobId}/keys`, { headers: headers() }),
        setJobStatus: (jobId: string, status: EnclaveJobStatus, message?: string) =>
            request.put(`/api/job/${jobId}`, { headers: headers(), data: { status, message } }),
        // `result` records RUN-COMPLETE; a `log` on its own records JOB-ERRORED.
        uploadResults: async (jobId: string, files: UploadFiles) => {
            const multipart: Record<string, EncryptedUpload> = {}
            if (files.resultFile) multipart.result = await encryptForKeys(files.resultFile, jobId)
            if (files.logFile) multipart.log = await encryptForKeys(files.logFile, jobId)
            return request.post(`/api/job/${jobId}/results`, { headers: headers(), multipart })
        },
    }
}

export type EnclaveClient = ReturnType<typeof createEnclaveClient>
