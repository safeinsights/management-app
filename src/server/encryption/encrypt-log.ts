import { ResultsWriter } from 'si-encryption/job-results/writer'
import type { PublicKey } from 'si-encryption/job-results/types'

export const LOG_FILENAME = 'error-log.txt'

/**
 * Creates an encrypted blob containing a log message.
 */
export async function createEncryptedLogBlob(message: string, recipients: PublicKey[]): Promise<Blob> {
    const writer = new ResultsWriter(recipients)
    const bytes = new TextEncoder().encode(message)
    await writer.addFile(LOG_FILENAME, bytes.buffer)
    return await writer.generate()
}
