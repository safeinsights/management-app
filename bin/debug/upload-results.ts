import fs from 'fs'
import path from 'path'
import { DebugRequest } from './request'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util/keypair'

// npx tsx bin/debug/upload-results.ts -j 0196cee0-9865-7b56-a167-7053bbcec3a9 -r tests/assets/results-with-pii.csv -l tests/assets/error-log.txt
// npx tsx bin/debug/upload-results.ts -j 0197a310-ebe0-7e07-af9d-8bfe94841b4b -r tests/assets/results-with-pii.csv -l tests/assets/error-log.txt
class FileSender extends DebugRequest {
    constructor() {
        super()
        this.program
            .option('-p, --publicKey <path>', 'Path to the public key file')
            .option('-r, --resultFile <path/to/file>', 'file to send as results')
            .option('-l, --logFile <path/to/file>', 'file to send as logs')
            .option('-j, --jobId <jobId>', 'jobId to set status for')
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
        const { resultFile, logFile, jobId } = this.program.opts()

        if (!resultFile && !logFile) {
            console.log(this.program.opts())
            console.warn('must supply either logs or results')
            process.exit(1)
        }

        const form = new FormData()

        if (resultFile) {
            form.append('result', await this.zipForFile(resultFile))
        }
        if (logFile) {
            form.append('log', await this.zipForFile(logFile))
        }

        const response = await fetch(`${this.baseURL}/api/job/${jobId}/results`, {
            method: 'POST',
            headers: { Authorization: this.authorization },
            body: form,
        })
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        return {}
    }
}

const sender = new FileSender()
sender.perform().then(() => {
    console.info(
        'Results must be decrypted using ONLY tests/support/private_key.pem.  normal reviewer keys will not work.  use:\ncat tests/support/private_key.pem | pbcopy',
    )
})
