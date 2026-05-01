import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { verifyToken } from '@clerk/backend'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import pg from 'pg'
import type { IncomingMessage, ServerResponse } from 'http'
import { TYPING_DEBOUNCE_MS, MAX_SAVE_INTERVAL_MS } from './constants.ts'

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
const REVIEW_FEEDBACK_PREFIX = 'review-feedback-'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function studyIdFromDocumentName(documentName: string): string | null {
    if (!documentName.startsWith(REVIEW_FEEDBACK_PREFIX)) return null
    const candidate = documentName.slice(REVIEW_FEEDBACK_PREFIX.length)
    return UUID_RE.test(candidate) ? candidate : null
}

// Mirrors src/server/config.ts:databaseURL() — accept DATABASE_URL directly for local/dev,
// otherwise fetch the RDS-managed secret JSON (host/username/password/dbname) and assemble.
async function resolvePoolConfig(): Promise<pg.PoolConfig> {
    if (process.env.DATABASE_URL) {
        log('db.config.source', { source: 'DATABASE_URL' })
        return { connectionString: process.env.DATABASE_URL }
    }

    const arn = process.env.DB_SECRET_ARN
    if (!arn) throw new Error('DATABASE_URL or DB_SECRET_ARN is required')

    log('db.config.source', { source: 'secretsManager', arn })
    const client = new SecretsManagerClient({})
    const data = await client.send(new GetSecretValueCommand({ SecretId: arn }))
    if (!data.SecretString) throw new Error(`failed to fetch db secret from ${arn}`)
    const db = JSON.parse(data.SecretString) as { username: string; password: string; host: string; dbname: string }
    log('db.config.resolved', { host: db.host, dbname: db.dbname, user: db.username })
    return {
        connectionString: `postgres://${encodeURIComponent(db.username)}:${encodeURIComponent(db.password)}@${db.host}/${db.dbname}`,
        // Aurora Postgres has rds.force_ssl=1; matches src/database/dialect.ts.
        ssl: { rejectUnauthorized: false },
    }
}

const pool = new pg.Pool(await resolvePoolConfig())
pool.on('error', (err) => log('db.pool.error', { message: err.message }))

// Background ping: don't block startup so the /health endpoint comes up
// before the ELB grace period expires.
pool.query<{ now: Date }>('SELECT now() AS now')
    .then((ping) => log('db.ping.ok', { now: ping.rows[0]?.now }))
    .catch((err) => log('db.ping.fail', { message: err instanceof Error ? err.message : String(err) }))

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
                const studyId = studyIdFromDocumentName(documentName)
                if (!studyId) {
                    log('db.store.reject', { documentName, reason: 'unrecoverable-studyId' })
                    throw new Error(`refusing to store ${documentName}: no recoverable studyId`)
                }
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
            tokenPreview: token ? `${token.slice(0, 8)}…${token.slice(-4)}` : null,
            headerKeys,
            paramKeys,
        })

        if (!token) {
            log('auth.fail', { documentName, reason: 'missing-token' })
            throw new Error('Not authorized: missing token')
        }

        let payload
        try {
            payload = await verifyToken(token, {
                jwtKey,
                secretKey,
                authorizedParties: authorizedParties.length ? authorizedParties : undefined,
            })
        } catch (err) {
            log('auth.fail', {
                documentName,
                reason: 'verify-token-threw',
                message: err instanceof Error ? err.message : String(err),
            })
            throw err
        }
        const clerkUserId = payload.sub
        if (!clerkUserId) {
            log('auth.fail', { documentName, reason: 'token-no-sub' })
            throw new Error('Not authorized: token has no subject')
        }
        log('auth.token-verified', { documentName, clerkUserId })

        const studyId = studyIdFromDocumentName(documentName)
        if (!studyId) {
            log('auth.fail', { documentName, reason: 'unrecognized-document', clerkUserId })
            throw new Error(`Not authorized: unrecognized document "${documentName}"`)
        }
        log('auth.document-parsed', { documentName, studyId })

        const userRow = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE clerk_id = $1', [clerkUserId])
        const internalUserId = userRow.rows[0]?.id
        if (!internalUserId) {
            log('auth.fail', { documentName, reason: 'user-not-provisioned', clerkUserId })
            throw new Error('Not authorized: user not provisioned')
        }

        const studyRow = await pool.query<{ org_id: string; submitted_by_org_id: string }>(
            'SELECT org_id, submitted_by_org_id FROM study WHERE id = $1',
            [studyId],
        )
        const study = studyRow.rows[0]
        if (!study) {
            log('auth.fail', { documentName, reason: 'study-not-found', studyId, internalUserId })
            throw new Error('Not authorized: study not found')
        }

        // Mirrors src/lib/permissions.ts `view Study` rule plus the SI-admin override
        // (admin of the `safe-insights` org). All three checks collapse into one query.
        const accessRow = await pool.query(
            `SELECT 1
               FROM org_user ou
               JOIN org o ON o.id = ou.org_id
              WHERE ou.user_id = $1
                AND (
                    (o.slug = $2 AND ou.is_admin = TRUE)
                    OR ou.org_id = $3
                    OR ou.org_id = $4
                )
              LIMIT 1`,
            [internalUserId, SI_ADMIN_ORG_SLUG, study.org_id, study.submitted_by_org_id],
        )
        if (accessRow.rowCount === 0) {
            log('auth.fail', {
                documentName,
                reason: 'no-org-membership',
                internalUserId,
                studyOrgId: study.org_id,
                submittedByOrgId: study.submitted_by_org_id,
            })
            throw new Error('Not authorized: no membership in study orgs')
        }

        log('auth.ok', { documentName, studyId, internalUserId })
        return { user: { id: internalUserId } }
    },
    async onConnect({ documentName }) {
        log('connect', { documentName })
    },
    async onDisconnect({ documentName, clientsCount }) {
        log('disconnect', { documentName, clientsCount })
    },
    async onLoadDocument({ documentName }) {
        log('loadDocument', { documentName })
    },
    async onRequest({ request, response }: { request: IncomingMessage; response: ServerResponse }) {
        if (request.url === '/health') {
            response.writeHead(200, { 'Content-Type': 'text/plain' })
            response.end('ok')
            throw null
        }
        log('http.request', { url: request.url, method: request.method })
    },
})

// Don't await: Hocuspocus' listen() resolves on shutdown, not on startup,
// so awaiting blocks forever and the /health endpoint never starts responding.
server.listen()
log('listening', { port: 4001 })
