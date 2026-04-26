import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import pg from 'pg'
import type { IncomingMessage, ServerResponse } from 'http'

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
})

const server = new Server({
    port: 1234,
    debounce: 2000,
    maxDebounce: 30_000,
    extensions: [
        new Database({
            fetch: async ({ documentName }) => {
                const result = await pool.query('SELECT data FROM yjs_document WHERE name = $1', [documentName])
                return result.rows[0]?.data ?? null
            },
            store: async ({ documentName, state }) => {
                await pool.query(
                    `INSERT INTO yjs_document (name, data, updated_at) VALUES ($1, $2, now())
                     ON CONFLICT (name) DO UPDATE SET data = $2, updated_at = now()`,
                    [documentName, Buffer.from(state)],
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
