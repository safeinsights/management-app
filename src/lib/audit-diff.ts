import type { Json } from '@/database/types'
import { isDeepEqual } from 'remeda'
import { z } from 'zod'

export type AuditFieldChange = {
    field: string
    before: Json
    after: Json
}

// Single source for the audited orgCodeEnv columns so the "before" select, the diff, and
// the audit metadata cannot drift apart as columns are added. Lives here rather than
// beside the actions because that is a server module, where every export must be an
// action.
export const AUDITED_CODE_ENV_FIELDS = [
    'name',
    'identifier',
    'language',
    'commandLines',
    'url',
    'isTesting',
    'settings',
    'sampleDataPath',
    'dataSourceType',
    'starterCodeFileNames',
] as const

const jsonSchema: z.ZodType<Json> = z.lazy(() =>
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonSchema), z.record(z.string(), jsonSchema)]),
)

export const auditFieldChangeSchema = z.object({
    field: z.string(),
    before: jsonSchema,
    after: jsonSchema,
})

export const codeEnvAuditMetadataSchema = z.object({
    changes: z.array(auditFieldChangeSchema).default([]),
    starterCodeReplaced: z.boolean().optional(),
    name: z.string().optional(),
})

export type CodeEnvAuditMetadata = z.infer<typeof codeEnvAuditMetadataSchema>

/**
 * `undefined` is not representable in JSON and would be dropped during jsonb
 * serialization, leaving an entry with a missing before/after key that the history
 * table cannot render. Collapsing it to `null` also makes "key absent from params"
 * compare equal to "column is null in the database" — without this, every save of a
 * record with an optional-but-null column reports a spurious change.
 */
const normalize = (value: unknown): Json => {
    if (value === undefined || value === null) return null
    if (value instanceof Date) return value.toISOString()
    return value as Json
}

export const REDACTED_ENV_VALUE = '••••••'

/**
 * Replaces environment variable values with a placeholder before they are recorded.
 *
 * `orgCodeEnv.settings` holds env var values in plaintext, but the audit trail is
 * append-only and outlives any later rotation — a credential written here would stay
 * readable by every org admin forever, even after the real one was changed. Names are
 * kept, since "which variable changed" is the part an admin needs during an incident.
 *
 * Applied only when recording: comparison still runs on the real values, so a change to
 * a value alone is still detected as a change.
 */
const redactSettings = (value: Json): Json => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value

    const environment = (value as Record<string, Json>).environment
    if (!Array.isArray(environment)) return value

    return {
        ...(value as Record<string, Json>),
        environment: environment.map((entry) =>
            entry !== null && typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry
                ? { ...(entry as Record<string, Json>), value: REDACTED_ENV_VALUE }
                : entry,
        ),
    }
}

const forRecording = (field: string, value: Json): Json => (field === 'settings' ? redactSettings(value) : value)

/**
 * Compares two records and returns one entry per field whose value changed.
 *
 * Values are compared structurally so jsonb and array columns diff by content:
 * Kysely parses a fresh object for every jsonb read, so reference equality would
 * report those fields as changed on every save. Structural comparison is also
 * immune to Postgres reordering jsonb object keys on storage, which makes a
 * stringify-based comparison report false positives.
 */
export function diffFields<T extends Record<string, unknown>>(
    before: Partial<T>,
    after: Partial<T>,
    fields: readonly (keyof T & string)[],
): AuditFieldChange[] {
    const changes: AuditFieldChange[] = []

    for (const field of fields) {
        const prev = normalize(before[field])
        const next = normalize(after[field])
        if (!isDeepEqual(prev, next)) {
            changes.push({ field, before: forRecording(field, prev), after: forRecording(field, next) })
        }
    }

    return changes
}
