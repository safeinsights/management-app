import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { verifyToken } from '@clerk/backend'
import type { IncomingMessage, ServerResponse } from 'http'
import { TYPING_DEBOUNCE_MS, MAX_SAVE_INTERVAL_MS } from './constants.ts'
import {
    type AuthenticatedContext,
    type StudyStatus,
    AuthFailureError,
    InfraUnavailableError,
    assertStatelessEventConsistent,
    authenticate,
    parseDocumentName,
    parseStatelessEvent,
    shouldPersistDocument,
    studyIdForDocument,
} from './auth.ts'
import { createSecretsClient, resolveDbSource } from './db-credentials.ts'
import { ResilientDbPool } from './db-pool.ts'
import { SLUG_TO_STUDY_COLUMN, seedYDocFromLexical, toLexicalJsonIfPlain } from './lexical-seed.ts'

// Decode (without verifying) the JWT's `sub` claim, purely for diagnostic
// logging when authentication has already failed. Returns null on any error.
function unsafeJwtSubject(token: string | null | undefined): string | null {
    if (!token) return null
    const parts = token.split('.')
    if (parts.length < 2) return null
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
        return typeof payload?.sub === 'string' ? payload.sub : null
    } catch {
        return null
    }
}

function log(event: string, fields: Record<string, unknown> = {}): void {
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }) + '\n')
}

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

log('startup.config', {
    hasJwtKey: !!jwtKey,
    hasSecretKey: !!secretKey,
    authorizedParties,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasDbSecretArn: !!process.env.DB_SECRET_ARN,
    nodeVersion: process.version,
})

const SI_ADMIN_ORG_SLUG = 'safe-insights'

// Resolve the DB source once at boot, then wrap it in a self-healing pool. The
// pool re-reads the secret and rebuilds itself if a deploy rotates the DB
// password, so the long-running editor task recovers without a restart
// (OTTER-626). DATABASE_URL (local/dev) is static and has nothing to refresh.
const source = await resolveDbSource(process.env, createSecretsClient())
log('db.config.source', {
    source: source.kind === 'connectionString' ? 'DATABASE_URL' : 'secretsManager',
})
const pool = new ResilientDbPool(source, log)

try {
    const now = await pool.ping()
    log('db.ping.ok', { now })
} catch (err) {
    log('db.ping.fail', { message: err instanceof Error ? err.message : String(err) })
    throw err
}

const server = new Server({
    port: 4001,
    debounce: TYPING_DEBOUNCE_MS,
    maxDebounce: MAX_SAVE_INTERVAL_MS,
    extensions: [
        new Database({
            fetch: async ({ documentName }) => {
                const result = await pool.query('SELECT data FROM yjs_document WHERE name = $1', [documentName])
                log('db.fetch', {
                    documentName,
                    found: result.rows.length > 0,
                    bytes: result.rows[0]?.data?.length ?? 0,
                })
                return result.rows[0]?.data ?? null
            },
            store: async ({ documentName, state }) => {
                const parsed = parseDocumentName(documentName)
                if (!parsed) {
                    log('db.store.reject', { documentName, reason: 'unrecognized-name' })
                    throw new Error(`refusing to store ${documentName}: unrecognized name`)
                }
                // Persist-time status gate: connection-time auth only covers new
                // and reconnecting clients. An already-connected client keeps
                // streaming Yjs updates between a status flip and its own kick-out.
                // Drop those writes silently so the canonical persisted state is
                // frozen at the editable-window edge.
                if (!(await shouldPersistDocument(parsed, pool))) return

                const studyId = await studyIdForDocument(parsed, pool)

                await pool.query(
                    `INSERT INTO yjs_document (name, data, study_id, updated_at) VALUES ($1, $2, $3, now())
                     ON CONFLICT (name) DO UPDATE SET data = $2, updated_at = now()`,
                    [documentName, Buffer.from(state), studyId],
                )
                log('db.store.ok', { documentName, bytes: state.length })
            },
        }),
    ],
    async onAuthenticate({ token, documentName, requestHeaders, requestParameters }) {
        const headerKeys = Object.keys(requestHeaders ?? {})
        const paramKeys = requestParameters ? Array.from(requestParameters.keys()) : []
        log('auth.start', {
            documentName,
            tokenLength: token?.length ?? 0,
            tokenPreview: token ? `${token.slice(0, 8)}...${token.slice(-4)}` : null,
            headerKeys,
            paramKeys,
        })
        try {
            const ctx = await authenticate(
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
            log('auth.ok', { documentName, internalUserId: ctx.user.id, clerkUserId: ctx.user.clerkId })
            return ctx
        } catch (err) {
            // A genuine auth rejection carries an AuthFailureError with a stable
            // CODE. Anything else (DB unreachable, password rejected even after
            // the pool's self-heal attempt) is an infra failure: re-wrap it so
            // the client shows a recoverable "reconnecting" state and retries,
            // rather than the terminal "editor unavailable" banner (OTTER-626).
            if (err instanceof AuthFailureError) {
                log('auth.fail', {
                    documentName,
                    code: err.code,
                    message: err.message,
                    clerkUserId: unsafeJwtSubject(token),
                })
                throw err
            }
            const message = err instanceof Error ? err.message : String(err)
            log('auth.infra', { documentName, message, clerkUserId: unsafeJwtSubject(token) })
            throw new InfraUnavailableError(message)
        }
    },
    async onLoadDocument({ documentName, document }) {
        log('loadDocument', { documentName })
        // Server-side bootstrap of fresh Y.Docs from the existing study columns.
        // Hocuspocus serializes `onLoadDocument` per document, so seeding runs
        // exactly once even when two clients open the page at the same instant.
        // This eliminates the client-side bootstrap race where both clients
        // would seed and the CRDT-additive merge would produce duplicated
        // content.
        const parsed = parseDocumentName(documentName)
        if (parsed?.kind !== 'proposal-text' && parsed?.kind !== 'proposal-resubmission-note') return
        // The Database extension's `fetch` already populated `document` if a
        // yjs_document row exists. Seeding only applies to the cold case.
        if (document.share.size > 0) return

        let lexicalJson: string | null = null
        if (parsed.kind === 'proposal-text') {
            const column = SLUG_TO_STUDY_COLUMN[parsed.slug]
            // Cast the jsonb column to text: pg parses a bare jsonb column into a JS
            // object, but seedYDocFromLexical expects the serialized JSON string (it
            // calls .trim()). Without the cast the seeder throws and is swallowed
            // below, leaving the editor blank.
            const row = await pool.query<{ value: string | null }>(
                `SELECT ${column}::text AS value FROM study WHERE id = $1`,
                [parsed.studyId],
            )
            lexicalJson = row.rows[0]?.value ?? null
        } else {
            // The note draft is a plain text column that predates the
            // collaborative note; toLexicalJsonIfPlain normalizes legacy plain
            // text and modern Lexical JSON drafts alike.
            const row = await pool.query<{ value: string | null }>(
                'SELECT proposal_resubmission_note_draft AS value FROM study WHERE id = $1',
                [parsed.studyId],
            )
            lexicalJson = toLexicalJsonIfPlain(row.rows[0]?.value)
        }
        if (!lexicalJson) return

        try {
            seedYDocFromLexical(document, lexicalJson)
        } catch (error) {
            console.warn(`onLoadDocument: failed to seed ${documentName}`, error)
        }
    },
    async onStateless({ payload, documentName, document, connection }) {
        // Defense-in-depth: only re-broadcast events whose shape, document kind,
        // sender identity, and (for proposal flows) DB study status all line
        // up. Forged or stale payloads are dropped silently; throwing here
        // would close the connection and disrupt unrelated sync.
        const parsedDoc = parseDocumentName(documentName)
        if (!parsedDoc) return

        const event = parseStatelessEvent(payload)
        if (!event) return

        const context = connection.context as AuthenticatedContext | undefined
        const connectionUserClerkId = context?.user?.clerkId
        const documentStudyId = context?.studyId
        if (!connectionUserClerkId || !documentStudyId) return

        // Code-review docs do not gate on DB status here; the action layer is
        // the single enforcer. Proposal/review-feedback events still need the
        // study-status sanity check.
        let studyStatus: StudyStatus | null = null
        if (parsedDoc.kind !== 'code-review-feedback') {
            const statusRow = await pool.query<{ status: StudyStatus }>('SELECT status FROM study WHERE id = $1', [
                documentStudyId,
            ])
            studyStatus = statusRow.rows[0]?.status ?? null
            if (!studyStatus) return
        }

        if (
            !assertStatelessEventConsistent({
                event,
                parsed: parsedDoc,
                documentStudyId,
                connectionUserClerkId,
                studyStatus,
            })
        ) {
            return
        }

        document.broadcastStateless(payload)
    },
    async onConnect({ documentName }) {
        log('connect', { documentName })
    },
    async onDisconnect({ documentName, clientsCount }) {
        log('disconnect', { documentName, clientsCount })
    },
    async onRequest({ request, response }: { request: IncomingMessage; response: ServerResponse }) {
        if (request.url === '/health') {
            response.writeHead(200, { 'Content-Type': 'text/plain' })
            response.end('ok')
            throw null
        }
        // Suppress Hocuspocus's default "Welcome to Hocuspocus!" greeting on
        // every path. The greeting confuses DAST scanners (ZAP-10095) and
        // exposes no value to legitimate clients — this service only serves
        // WebSocket upgrades plus /health.
        log('http.request', { url: request.url, method: request.method })
        response.writeHead(404, { 'Content-Type': 'text/plain' })
        response.end('Not Found')
        throw null
    },
})

await server.listen()
log('listening', { port: 4001 })
