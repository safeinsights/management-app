import { ResultsWriter } from 'si-encryption/job-results/writer'
import type { PublicKey } from 'si-encryption/job-results/types'

export async function createEncryptedLogBlob(
    message: string,
    recipients: PublicKey[],
    filename: string,
): Promise<Blob> {
    const writer = new ResultsWriter(recipients)
    const bytes = new TextEncoder().encode(message)
    await writer.addFile(filename, bytes.buffer)
    return await writer.generate()
}
