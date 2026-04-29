import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { verifyToken } from '@clerk/backend'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import pg from 'pg'
import type { IncomingMessage, ServerResponse } from 'http'
import { TYPING_DEBOUNCE_MS, MAX_SAVE_INTERVAL_MS } from './constants.ts'
import {
    type AuthenticatedContext,
    type StudyStatus,
    assertStatelessEventConsistent,
    authenticate,
    parseDocumentName,
    parseStatelessEvent,
    shouldPersistDocument,
} from './auth.ts'
import { SLUG_TO_STUDY_COLUMN, seedYDocFromLexical } from './lexical-seed.ts'

const jwtKey = process.env.CLERK_JWT_KEY
if (!jwtKey) {
    // Fail closed: refuse to start rather than silently allow anonymous WS connections.
    throw new Error('CLERK_JWT_KEY is required')
}
const secretKey = process.env.CLERK_SECRET_KEY
const authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const SI_ADMIN_ORG_SLUG = 'safe-insights'

// Mirrors src/server/config.ts:databaseURL() — accept DATABASE_URL directly for local/dev,
// otherwise fetch the RDS-managed secret JSON (host/username/password/dbname) and assemble.
async function resolvePoolConfig(): Promise<pg.PoolConfig> {
    if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }

    const arn = process.env.DB_SECRET_ARN
    if (!arn) throw new Error('DATABASE_URL or DB_SECRET_ARN is required')

    const client = new SecretsManagerClient({})
    const data = await client.send(new GetSecretValueCommand({ SecretId: arn }))
    if (!data.SecretString) throw new Error(`failed to fetch db secret from ${arn}`)
    const db = JSON.parse(data.SecretString) as { username: string; password: string; host: string; dbname: string }
    return {
        connectionString: `postgres://${encodeURIComponent(db.username)}:${encodeURIComponent(db.password)}@${db.host}/${db.dbname}`,
        // Aurora Postgres has rds.force_ssl=1; matches src/database/dialect.ts.
        ssl: { rejectUnauthorized: false },
    }
}

const pool = new pg.Pool(await resolvePoolConfig())

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
                const parsed = parseDocumentName(documentName)
                if (!parsed) {
                    throw new Error(`refusing to store ${documentName}: unrecognized name`)
                }
                // Persist-time status gate: connection-time auth only covers new
                // and reconnecting clients. An already-connected client keeps
                // streaming Yjs updates between a status flip and its own kick-out.
                // Drop those writes silently so the canonical persisted state is
                // frozen at the editable-window edge.
                if (!(await shouldPersistDocument(parsed, pool))) return

                await pool.query(
                    `INSERT INTO yjs_document (name, data, study_id, updated_at) VALUES ($1, $2, $3, now())
                     ON CONFLICT (name) DO UPDATE SET data = $2, updated_at = now()`,
                    [documentName, Buffer.from(state), parsed.studyId],
                )
            },
        }),
    ],
    async onAuthenticate({ token, documentName }) {
        return authenticate(
            { token, documentName },
            {
                db: pool,
                verifyToken,
                jwtKey,
                secretKey,
                authorizedParties,
                siAdminOrgSlug: SI_ADMIN_ORG_SLUG,
            },
        )
    },
    async onLoadDocument({ documentName, document }) {
        // Server-side bootstrap of fresh proposal-text Y.Docs from the existing
        // study column. Hocuspocus serializes `onLoadDocument` per document,
        // so seeding runs exactly once even when two clients open the page at
        // the same instant. This eliminates the client-side bootstrap race
        // where both clients would seed and the CRDT-additive merge would
        // produce duplicated content.
        const parsed = parseDocumentName(documentName)
        if (parsed?.kind !== 'proposal-text') return
        // The Database extension's `fetch` already populated `document` if a
        // yjs_document row exists. Seeding only applies to the cold case.
        if (document.share.size > 0) return

        const column = SLUG_TO_STUDY_COLUMN[parsed.slug]
        const row = await pool.query<{ value: string | null }>(`SELECT ${column} AS value FROM study WHERE id = $1`, [
            parsed.studyId,
        ])
        const lexicalJson = row.rows[0]?.value
        if (!lexicalJson) return

        try {
            seedYDocFromLexical(document, lexicalJson)
        } catch (error) {
            console.warn(`onLoadDocument: failed to seed ${documentName} from study.${column}`, error)
        }
    },
    async onStateless({ payload, documentName, document, connection }) {
        // Defense-in-depth: only re-broadcast events whose shape, document kind,
        // sender identity, and DB study status all line up. Forged or stale
        // payloads are dropped silently; throwing here would close the
        // connection and disrupt unrelated sync.
        const parsedDoc = parseDocumentName(documentName)
        if (!parsedDoc) return

        const event = parseStatelessEvent(payload)
        if (!event) return

        const context = connection.context as AuthenticatedContext | undefined
        const connectionUserClerkId = context?.user?.clerkId
        if (!connectionUserClerkId) return

        const statusRow = await pool.query<{ status: StudyStatus }>('SELECT status FROM study WHERE id = $1', [
            parsedDoc.studyId,
        ])
        const studyStatus = statusRow.rows[0]?.status
        if (!studyStatus) return

        if (
            !assertStatelessEventConsistent({
                event,
                parsed: parsedDoc,
                connectionUserClerkId,
                studyStatus,
            })
        ) {
            return
        }

        document.broadcastStateless(payload)
    },
    async onRequest({ request, response }: { request: IncomingMessage; response: ServerResponse }) {
        if (request.url === '/health') {
            response.writeHead(200, { 'Content-Type': 'text/plain' })
            response.end('ok')
            throw null
        }
    },
})

server.listen()
