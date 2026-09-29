import type { Json } from '@/database/types'
import { isDeepEqual } from 'remeda'
import { z } from 'zod'

export type AuditFieldChange = {
    field: string
    before: Json
    after: Json
}

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

// `undefined` is dropped in jsonb serialization, and collapsing to `null` makes an absent
// key compare equal to a null column so it stops reporting a change on every save.
const normalize = (value: unknown): Json => {
    if (value === undefined || value === null) return null
    if (value instanceof Date) return value.toISOString()
    return value as Json
}

export const REDACTED_ENV_VALUE = '••••••'

// The audit trail is append-only and outlives any rotation, so a plaintext env var value
// written here would stay readable by every org admin forever.
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

// Compared structurally: Kysely parses a fresh object for every jsonb read, and Postgres may
// reorder jsonb keys on storage.
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
