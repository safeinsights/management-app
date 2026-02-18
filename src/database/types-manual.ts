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
