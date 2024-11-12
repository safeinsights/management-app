import { Command } from 'commander'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import fetch from 'node-fetch'

export class DebugRequest {
    program = new Command()
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET'
    body: Record<string, string> | null = null
    response: Record<string, string> | null = null

    constructor(public path = '') {
        this.program
            .requiredOption('-m, --member <member>', 'member identifier')
            .requiredOption('-o, --origin <origin>', 'base URL to send the request to')
            .requiredOption('-k, --key <path>', 'Path to the private key file')
    }

    parse() {
        this.program.parse(process.argv)

        return this
    }

    get authorization() {
        const { key, member } = this.program.opts()
        const privateKey = fs.readFileSync(key, 'utf8')
        const payload = {
            iss: member,
            exp: Math.floor(Date.now() / 1000) + 60 * 60, // Token expiration (1 hour)
        }
        const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' })
        return `Bearer ${token}`
    }

    async perform() {
        const { origin } = this.program.opts()

        const response = await fetch(`${origin}/api/${this.path}`, {
            method: this.method,
            headers: {
                Authorization: this.authorization,
                'Content-Type': 'application/json',
            },
            body: this.body ? JSON.stringify(this.body) : undefined,
        })
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        if (response.headers.get('content-type')?.includes('application/json')) {
            this.response = (await response.json()) as Record<string, string>
            return this.response
        }
        return {}
    }
}
