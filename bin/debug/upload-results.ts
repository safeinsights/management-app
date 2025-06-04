import fs from 'fs'
import path from 'path'
import { DebugRequest } from './request'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util/keypair'

class FileSender extends DebugRequest {
    constructor() {
        super()
        this.program
            .option('-p, --publicKey <path>', 'Path to the public key file')
            .option('-f, --file <path to file>', 'file to send as results')
            .option('-j, --jobId <jobId>', 'jobId to set status for')
        this.parse()
    }

    get publicKey() {
        return fs.readFileSync(this.program.opts().publicKey || 'tests/support/public_key.pem', 'utf8')
    }

    async perform() {
        const { file: filePath, jobId } = this.program.opts()
        const publicKey = pemToArrayBuffer(this.publicKey)
        const writer = new ResultsWriter([{ fingerprint: await fingerprintKeyData(publicKey), publicKey }])
        const buffer = fs.readFileSync(filePath)
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        await writer.addFile(path.basename(filePath), arrayBuffer as ArrayBuffer)
        const zip = await writer.generate()
        const form = new FormData()
        form.append('file', zip)

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
    console.log(
        'Results must be decrypted using ONLY tests/support/private_key.pem.  normal reviewer keys will not work.  use:\ncat tests/support/private_key.pem | pbcopy',
    )
})
