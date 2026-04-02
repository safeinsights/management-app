/**
 * Manual type definitions for database types that need custom typing
 * These types are referenced by kysely-codegen overrides in bin/migrate-dev-db
 */

export type EnvVar = {
    name: string
    value: string
}

export type OrgCodeEnvSettings = {
    environment: EnvVar[]
}

export type CommandLines = Record<string, string>

/**
 * Pre-serializes a value for insertion into a JSONB column.
 * The pg driver treats JS arrays as PostgreSQL arrays rather than JSON arrays,
 * and nested objects can also mis-serialize. Wrapping with JSON.stringify
 * ensures the value reaches PostgreSQL as a valid JSON string.
 */
export function toJsonb<T>(value: T): T {
    return JSON.stringify(value) as unknown as T
}
