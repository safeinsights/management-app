// Referenced by kysely-codegen overrides in bin/migrate-dev-db.

export type EnvVar = {
    name: string
    value: string
}

export type OrgCodeEnvSettings = {
    environment: EnvVar[]
}

export type CommandLines = Record<string, string>
