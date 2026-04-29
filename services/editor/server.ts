import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import pg from 'pg'
import type { IncomingMessage, ServerResponse } from 'http'
import { TYPING_DEBOUNCE_MS, MAX_SAVE_INTERVAL_MS } from './constants.ts'

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
})

const REVIEW_FEEDBACK_PREFIX = 'review-feedback-'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function studyIdFromDocumentName(documentName: string): string | null {
    if (!documentName.startsWith(REVIEW_FEEDBACK_PREFIX)) return null
    const candidate = documentName.slice(REVIEW_FEEDBACK_PREFIX.length)
    return UUID_RE.test(candidate) ? candidate : null
}

const server = new Server({
    port: 1234,
    debounce: TYPING_DEBOUNCE_MS,
    maxDebounce: MAX_SAVE_INTERVAL_MS,
    extensions: [
        new Database({
            fetch: async ({ documentName }) => {
                const result = await pool.query('SELECT data FROM yjs_document WHERE name = $1', [documentName])
                return result.rows[0]?.data ?? null
            },
            store: async ({ documentName, state }) => {
                const studyId = studyIdFromDocumentName(documentName)
                if (!studyId) {
                    throw new Error(`refusing to store ${documentName}: no recoverable studyId`)
                }
                await pool.query(
                    `INSERT INTO yjs_document (name, data, study_id, updated_at) VALUES ($1, $2, $3, now())
                     ON CONFLICT (name) DO UPDATE SET data = $2, updated_at = now()`,
                    [documentName, Buffer.from(state), studyId],
                )
            },
        }),
    ],
    async onRequest({ request, response }: { request: IncomingMessage; response: ServerResponse }) {
        if (request.url === '/health') {
            response.writeHead(200, { 'Content-Type': 'text/plain' })
            response.end('ok')
            throw null
        }
    },
})

server.listen()
