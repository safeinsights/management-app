import net from 'node:net'
import { IS_CI } from './common.helpers'

export async function isS3Reachable(): Promise<boolean> {
    const endpoint = process.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333'
    let host: string
    let port: number
    try {
        const url = new URL(endpoint)
        host = url.hostname
        port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80)
    } catch {
        return false
    }
    return new Promise((resolve) => {
        const socket = net.createConnection({ host, port })
        const done = (ok: boolean) => {
            socket.destroy()
            resolve(ok)
        }
        socket.once('connect', () => done(true))
        socket.once('error', () => done(false))
        socket.setTimeout(500, () => done(false))
    })
}

// Lets tests skip when SeaweedFS isn't running locally; on CI a missing service must fail loudly
// rather than silently skip.
export const s3Available = await isS3Reachable()

if (!s3Available && IS_CI) {
    throw new Error(
        `S3 endpoint ${process.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333'} is not reachable on CI — ` +
            'integration tests require SeaweedFS to be running. Check the CI service config.',
    )
}
