import { Command } from 'commander'
import fs from 'fs'
import jwt from 'jsonwebtoken'

export class DebugRequest {
    program = new Command()
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET'
    body: Record<string, string> | null = null
    response: Record<string, string> | null = null

    constructor(public path = '') {
        this.program
            .option('-m, --member <member>', 'member slug')
            .option('-o, --origin <origin>', 'base URL to send the request to')
            .option('-k, --key <path>', 'Path to the private key file')
    }

    parse() {
        this.program.parse(process.argv)

        return this
    }

    get privateKey() {
        return fs.readFileSync(this.program.opts().key || 'tests/support/private_key.pem', 'utf8')
    }

    get authorization() {
        const { member = 'openstax' } = this.program.opts()
        //const privateKey = fs.readFileSync(key, 'utf8')
        const payload = {
            iss: member,
            exp: Math.floor(Date.now() / 1000) + 60 * 60, // Token expiration (1 hour)
        }
        const token = jwt.sign(payload, this.privateKey, { algorithm: 'RS256' })
        return `Bearer ${token}`
    }

    get origin() {
        return this.program.opts().origin || 'http://localhost:4000'
    }

    async perform() {
        const url = `${this.origin}/api/${this.path}`
        console.log(`Sending request to ${url}`)
        const response = await fetch(url, {
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
