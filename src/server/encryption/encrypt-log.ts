import { ResultsWriter } from 'si-encryption/job-results/writer'
import type { PublicKey } from 'si-encryption/job-results/types'

export const LOG_FILENAME = 'error-log.txt'

/**
 * Creates an encrypted zip containing a log message.
 */
export async function createEncryptedLogZip(message: string, recipients: PublicKey[]): Promise<Uint8Array> {
    const writer = new ResultsWriter(recipients)
    const bytes = new TextEncoder().encode(message)
    await writer.addFile(LOG_FILENAME, bytes.buffer)
    const blob = await writer.generate()
    return new Uint8Array(await blob.arrayBuffer())
}
