import fs from 'fs'
import path from 'path'
import { DebugRequest } from './request'

class FileSender extends DebugRequest {
    constructor() {
        super()
        this.program
            .option('-f, --file <path to file>', 'file to send as results')
            .option('-j, --jobId <jobId>', 'jobId to set status for')
        this.parse()
    }

    async perform() {
        const { origin, file: filePath, jobId } = this.program.opts()
        const file = new File([fs.readFileSync(filePath)], path.basename(filePath), { type: 'text/plain' })
        const form = new FormData()
        form.append('file', file)
        const response = await fetch(`${origin}/api/job/${jobId}/results`, {
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
sender.perform()
