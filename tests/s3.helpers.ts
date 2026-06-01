import net from 'node:net'
import { IS_CI } from './common.helpers'

// Probes the S3-compatible endpoint (SeaweedFS locally) so integration-style
// tests can skip cleanly when devs haven't run `docker compose up seaweedfs`.
//
// On CI the service is expected to be up, so an unreachable endpoint is a setup
// bug rather than a skip condition — callers use `s3RequiredOrSkip` to turn that
// into a hard failure.
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

// Probes once at module load. Tests use `s3Available` with `describe.skipIf` /
// `test.skipIf`; on CI an unreachable endpoint throws so the missing service is
// surfaced instead of silently skipped.
export const s3Available = await isS3Reachable()

if (!s3Available && IS_CI) {
    throw new Error(
        `S3 endpoint ${process.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333'} is not reachable on CI — ` +
            'integration tests require SeaweedFS to be running. Check the CI service config.',
    )
}
