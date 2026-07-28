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
            changes.push({ field, before: prev, after: next })
        }
    }

    return changes
}
