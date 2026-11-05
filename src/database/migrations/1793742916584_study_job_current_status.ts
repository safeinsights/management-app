import { type Kysely, sql } from 'kysely'

// OTTER-973: stores each job's current status, code round and status time, backfilled from its log.
// The status writer keeps the columns from then on. Triggers keep them for rows from app code older
// than the columns, which serves again only after a rollback: deploys swap the code before migrating.

// Pinned rather than imported from src/lib/job-status-rules.ts: this is the rule older code ran under,
// so it stays as it is when the runtime table changes. Never edit it after the migration has run.
const STAGES = ['JOB-PACKAGING', 'JOB-READY', 'JOB-PROVISIONING', 'JOB-RUNNING']

// The (to, from) pairs whose row stays as history without moving the job.
const BACKFILL_LOG_PAIRS: Readonly<Record<string, readonly string[]>> = {
    'CODE-SCANNED': ['CODE-CHANGES-REQUESTED', 'CODE-APPROVED', ...STAGES, 'JOB-ERRORED', 'RUN-COMPLETE'],
    'JOB-ERRORED': ['CODE-CHANGES-REQUESTED'],
    ...Object.fromEntries(
        STAGES.map((stage, index) => [stage, [...STAGES.slice(index + 1), 'JOB-ERRORED', 'RUN-COMPLETE']]),
    ),
    'RESULTS-VIEWED': ['FILES-APPROVED', 'FILES-REJECTED'],
}

const BACKFILL_DECISION_STATUSES = ['FILES-APPROVED', 'FILES-REJECTED']

// A decided round only changes its decision: a late report after it stays history. Every other pair moves.
export function backfillEffect(from: string, to: string): 'move' | 'log' {
    if (BACKFILL_LOG_PAIRS[to]?.includes(from)) return 'log'
    return BACKFILL_DECISION_STATUSES.includes(from) && !BACKFILL_DECISION_STATUSES.includes(to) ? 'log' : 'move'
}

// Orders rows that tie on created_at, which rows written in one transaction under now() do.
const BACKFILL_TIE_RANK = [
    'INITIATED',
    'CODE-SUBMITTED',
    'CODE-SCANNED',
    'CODE-CHANGES-REQUESTED',
    'CODE-APPROVED',
    'CODE-REJECTED',
    'JOB-PACKAGING',
    'JOB-READY',
    'JOB-PROVISIONING',
    'JOB-RUNNING',
    'JOB-ERRORED',
    'RUN-COMPLETE',
    'FILES-APPROVED',
    'FILES-REJECTED',
    'RESULTS-VIEWED',
]

const BACKFILL_ROUND_CLOSING_STATUSES = ['CODE-CHANGES-REQUESTED', 'FILES-APPROVED', 'FILES-REJECTED']

export type BackfillRow = { id: string; status: string; micros: string }

const isCodeReviewRow = (row: BackfillRow) => row.status === 'CODE-SUBMITTED' || row.status === 'CODE-CHANGES-REQUESTED'

// Submissions and change requests alternate on a job, so where they tie, the job's history so far says
// which came first: a change request ties with the resubmission it caused, a submission with its review.
function alternateTiedCodeReviews(sorted: BackfillRow[]): BackfillRow[] {
    const ordered: BackfillRow[] = []
    let submissions = 0
    let requests = 0
    for (let start = 0; start < sorted.length; ) {
        let end = start
        while (end < sorted.length && sorted[end].micros === sorted[start].micros) end++
        let group = sorted.slice(start, end)
        const subs = group.filter((row) => row.status === 'CODE-SUBMITTED')
        const reqs = group.filter((row) => row.status === 'CODE-CHANGES-REQUESTED')
        if (subs.length && reqs.length) {
            const alternated: BackfillRow[] = []
            let requestNext = submissions > requests
            while (subs.length || reqs.length) {
                const row = (requestNext && reqs.length) || !subs.length ? reqs.shift()! : subs.shift()!
                alternated.push(row)
                requestNext = row.status === 'CODE-SUBMITTED'
            }
            group = group.map((row) => (isCodeReviewRow(row) ? alternated.shift()! : row))
        }
        submissions += group.filter((row) => row.status === 'CODE-SUBMITTED').length
        requests += group.filter((row) => row.status === 'CODE-CHANGES-REQUESTED').length
        ordered.push(...group)
        start = end
    }
    return ordered
}

// The row whose status the job is in, or null for a job with no rows.
export function backfillReplay(rows: readonly BackfillRow[]): BackfillRow | null {
    const sorted = [...rows].sort((a, b) => {
        const diff = BigInt(a.micros) - BigInt(b.micros)
        if (diff !== BigInt(0)) return diff < BigInt(0) ? -1 : 1
        const rank = BACKFILL_TIE_RANK.indexOf(a.status) - BACKFILL_TIE_RANK.indexOf(b.status)
        return rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    })
    let current: BackfillRow | null = null
    for (const row of alternateTiedCodeReviews(sorted)) {
        if (current && row.status === current.status) continue
        if (current && backfillEffect(current.status, row.status) === 'log') continue
        current = row
    }
    return current
}

const BATCH_SIZE = 1000

// `jobIds` narrows the backfill so a unit test touches only its own jobs. The migration passes nothing.
export async function backfillStudyJobState(db: Kysely<unknown>, { jobIds }: { jobIds?: string[] } = {}) {
    const scope = jobIds ? sql`AND id = ANY(${jobIds}::uuid[])` : sql``
    let after = '00000000-0000-0000-0000-000000000000'

    for (;;) {
        // One-word aliases: the migrator's CamelCasePlugin rewrites result column names.
        const jobs = await sql<{ id: string }>`
            SELECT id FROM study_job WHERE id > ${after}::uuid ${scope} ORDER BY id LIMIT ${BATCH_SIZE}
        `.execute(db)
        if (jobs.rows.length === 0) break
        const ids = jobs.rows.map((job) => job.id)
        after = ids.at(-1)!

        const rows = await sql<BackfillRow & { job: string }>`
            SELECT study_job_id AS job, id, status::text AS status,
                   (extract(epoch FROM created_at) * 1000000)::bigint::text AS micros
            FROM job_status_change
            WHERE study_job_id = ANY(${ids}::uuid[])
        `.execute(db)
        const rowsByJob = new Map<string, BackfillRow[]>()
        for (const row of rows.rows) rowsByJob.set(row.job, [...(rowsByJob.get(row.job) ?? []), row])

        const values = ids.map((id) => {
            const current = backfillReplay(rowsByJob.get(id) ?? [])
            return sql`(${id}::uuid, ${current?.status ?? 'INITIATED'}::text, ${current?.id ?? null}::uuid)`
        })
        // The change time is read from the row itself, which keeps the microseconds a JS Date drops.
        await sql`
            UPDATE study_job AS job
            SET current_status = state.status::study_job_status,
                status_changed_at = coalesce(
                    (SELECT created_at FROM job_status_change WHERE id = state.row_id),
                    job.created_at
                )
            FROM (VALUES ${sql.join(values)}) AS state(id, status, row_id)
            WHERE job.id = state.id
        `.execute(db)
    }

    await sql`UPDATE study_job SET round = study_job_round(id) WHERE true ${scope}`.execute(db)
}

// The statuses are fixed constants, so they are written into the function bodies as literals, and every
// comparison is on text: a fresh database runs all migrations in one transaction, where Postgres refuses
// enum values that an earlier migration in it added.
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`
const literalList = (values: readonly string[]) => values.map(literal).join(', ')

// The rule codeRoundForJob uses: closers on the jobs before this one, plus this job's resubmissions.
const ROUND_FUNCTION = `
    CREATE FUNCTION study_job_round(uuid) RETURNS integer LANGUAGE sql STABLE AS $$
        SELECT (1 + (
            SELECT count(*)
            FROM job_status_change closer
            JOIN study_job sibling ON sibling.id = closer.study_job_id
            JOIN study_job job ON job.id = $1
            WHERE sibling.study_id = job.study_id
              AND (sibling.created_at, sibling.id) < (job.created_at, job.id)
              AND closer.status::text IN (${literalList(BACKFILL_ROUND_CLOSING_STATUSES)})
        ) + greatest(0, (
            SELECT count(*)
            FROM job_status_change submission
            WHERE submission.study_job_id = $1
              AND submission.status::text = 'CODE-SUBMITTED'
        ) - 1))::integer
    $$
`

// backfillEffect in SQL, for the triggers.
export const EFFECT_FUNCTION = `
    CREATE FUNCTION job_status_effect(text, text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT CASE
            WHEN ($2, $1) IN (VALUES ${Object.entries(BACKFILL_LOG_PAIRS)
                .flatMap(([to, froms]) => froms.map((from) => `(${literal(to)}, ${literal(from)})`))
                .join(', ')}) THEN 'log'
            WHEN $1 IN (${literalList(BACKFILL_DECISION_STATUSES)})
                AND $2 NOT IN (${literalList(BACKFILL_DECISION_STATUSES)}) THEN 'log'
            ELSE 'move'
        END
    $$
`

// The status writer sets this flag around its inserts and keeps the columns itself, so the triggers
// act only on rows from older code.
export const JOB_WRITER_FLAG = 'app.job_writer'
const writerSkip = `IF current_setting('${JOB_WRITER_FLAG}', true) = 'on' THEN RETURN NULL; END IF;`

// The replay of the backfill, one row at a time: the first row of a job and every move set the status
// and its time, and a submission renumbers the job's round. Rows apply in the order they are inserted.
export const STATUS_TRIGGER = `
    CREATE FUNCTION keep_study_job_state() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
        stored study_job_status;
    BEGIN
        ${writerSkip}
        SELECT current_status INTO stored FROM study_job WHERE id = NEW.study_job_id FOR NO KEY UPDATE;
        IF NOT EXISTS (SELECT 1 FROM job_status_change WHERE study_job_id = NEW.study_job_id AND id <> NEW.id)
            OR (NEW.status <> stored AND job_status_effect(stored::text, NEW.status::text) = 'move') THEN
            UPDATE study_job SET current_status = NEW.status, status_changed_at = NEW.created_at
            WHERE id = NEW.study_job_id;
        END IF;
        IF NEW.status::text = 'CODE-SUBMITTED' THEN
            UPDATE study_job SET round = study_job_round(NEW.study_job_id) WHERE id = NEW.study_job_id;
        END IF;
        RETURN NULL;
    END
    $$;
    CREATE TRIGGER keep_study_job_state AFTER INSERT ON job_status_change
        FOR EACH ROW EXECUTE FUNCTION keep_study_job_state();
`

export const ROUND_TRIGGER = `
    CREATE FUNCTION number_study_job_round() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        ${writerSkip}
        UPDATE study_job SET round = study_job_round(NEW.id) WHERE id = NEW.id;
        RETURN NULL;
    END
    $$;
    CREATE TRIGGER number_study_job_round AFTER INSERT ON study_job
        FOR EACH ROW EXECUTE FUNCTION number_study_job_round();
`

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('study_job')
        .addColumn('current_status', sql`study_job_status`, (col) => col.notNull().defaultTo('INITIATED'))
        .addColumn('round', 'integer', (col) => col.notNull().defaultTo(1))
        .addColumn('status_changed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute()

    await sql.raw(ROUND_FUNCTION).execute(db)
    await sql.raw(EFFECT_FUNCTION).execute(db)

    // The migrator runs this in one transaction, so the ADD COLUMN lock holds study_job, reads included,
    // until the backfill and the triggers commit. The app waits rather than writing beside it.
    await backfillStudyJobState(db)
    await sql.raw(STATUS_TRIGGER).execute(db)
    await sql.raw(ROUND_TRIGGER).execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP TRIGGER number_study_job_round ON study_job`.execute(db)
    await sql`DROP TRIGGER keep_study_job_state ON job_status_change`.execute(db)
    await sql`DROP FUNCTION number_study_job_round(), keep_study_job_state(), job_status_effect(text, text), study_job_round(uuid)`.execute(
        db,
    )
    await db.schema
        .alterTable('study_job')
        .dropColumn('current_status')
        .dropColumn('round')
        .dropColumn('status_changed_at')
        .execute()
}
