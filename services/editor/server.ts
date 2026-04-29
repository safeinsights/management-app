import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import pg from 'pg'
import type { IncomingMessage, ServerResponse } from 'http'

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
})

type DocumentContext = { studyId: string }

const server = new Server({
    port: 1234,
    debounce: 2000,
    maxDebounce: 30_000,
    async onAuthenticate({ token }): Promise<DocumentContext> {
        // The client passes the studyId as the connection token; thread it through
        // the Hocuspocus per-document `context` so the store hook can write the FK.
        if (!token) throw new Error('missing studyId token')
        return { studyId: token }
    },
    extensions: [
        new Database({
            fetch: async ({ documentName }) => {
                const result = await pool.query('SELECT data FROM yjs_document WHERE name = $1', [documentName])
                return result.rows[0]?.data ?? null
            },
            store: async ({ documentName, state, context }) => {
                const { studyId } = context as DocumentContext
                // The yjs_document.name is a global PK, so we need a naming scheme that includes the studyId
                // to prevent collisions across studies
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
