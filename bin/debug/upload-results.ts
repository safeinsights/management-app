import fs from 'fs'
import path from 'path'
import { DebugRequest, extractJobId } from './request'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util/keypair'

// To upload logs AND results - replace job ID with your own job ID
// npx tsx bin/debug/upload-results.ts -j 0197d06b-a4ae-7178-bc27-64aa8b288ce8 -r tests/assets/results-with-pii.csv -l tests/assets/error-log.txt
// To upload logs only
// npx tsx bin/debug/upload-results.ts -j 0197d06b-a4ae-7178-bc27-64aa8b288ce8 -l tests/assets/error-log.txt
// To upload results only
// // npx tsx bin/debug/upload-results.ts -j 0197d06b-a4ae-7178-bc27-64aa8b288ce8 -r tests/assets/results-with-pii.csv

class FileSender extends DebugRequest {
    constructor() {
        super()
        this.program
            .option('-p, --publicKey <path>', 'Path to the public key file')
            .option('-r, --resultFile <path/to/file>', 'file to send as results')
            .option('-l, --logFile <path/to/file>', 'file to send as logs')
            .option('-j, --jobId <jobId>', 'jobId or URL containing a jobId')
        this.parse()
    }

    async writerArgs() {
        const publicKey = pemToArrayBuffer(
            fs.readFileSync(this.program.opts().publicKey || 'tests/support/public_key.pem', 'utf8'),
        )

        return [{ fingerprint: await fingerprintKeyData(publicKey), publicKey }]
    }

    async zipForFile(filePath: string) {
        const writer = new ResultsWriter(await this.writerArgs())
        const buffer = fs.readFileSync(filePath)
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        await writer.addFile(path.basename(filePath), arrayBuffer as ArrayBuffer)
        return await writer.generate()
    }

    async perform() {
        const { resultFile, logFile } = this.program.opts()
        const jobId = extractJobId(this.program.opts().jobId)

        if (!resultFile && !logFile) {
            // eslint-disable-next-line no-console
            console.log(this.program.opts())
            console.warn('must supply either logs or results')
            process.exit(1)
        }

        const form = new FormData()

        if (resultFile) {
            form.append('result', await this.zipForFile(resultFile), path.basename(resultFile))
        }
        if (logFile) {
            form.append('log', await this.zipForFile(logFile), path.basename(logFile))
        }

        const response = await fetch(`${this.baseURL}/api/job/${jobId}/results`, {
            method: 'POST',
            headers: { Authorization: this.authorization },
            body: form,
        })
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} ${response.statusText} ${await response.text()}`)
        }
        return {}
    }
}

const sender = new FileSender()
sender.perform().then(() => {
    // eslint-disable-next-line no-console
    console.info(
        'Results must be decrypted using ONLY tests/support/private_key.pem.  normal reviewer keys will not work.  use:\ncat tests/support/private_key.pem | pbcopy',
    )
})
