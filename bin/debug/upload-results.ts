import fs from 'fs'
import path from 'path'
import { DebugRequest } from './request'

class FileSender extends DebugRequest {
    constructor() {
        super()
        this.program
            .option('-f, --file <path to file>', 'file to send as results')
            .option('-r, --runId <runId>', 'runId to set status for')
        this.parse()
    }

    async perform() {
        const { origin, file: filePath, runId } = this.program.opts()
        const file = new File([fs.readFileSync(filePath)], path.basename(filePath), { type: 'text/plain' })
        const form = new FormData()
        form.append('file', file)
        const response = await fetch(`${origin}/api/run/${runId}/results`, {
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
