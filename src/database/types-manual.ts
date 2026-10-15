// Referenced by kysely-codegen overrides in bin/migrate-dev-db.
import type { Language } from './types'

export type EnvVar = {
    name: string
    value: string
}

export type OrgCodeEnvSettings = {
    environment: EnvVar[]
}

export type CommandLines = Record<string, string>

// A study's own copy of the code env chosen for its language, so later edits to the
// org's code envs cannot change what the study runs. Keys match the orgCodeEnv columns. The identifier,
// starter code file names and sample data path are left out: they name the sample database and the
// files in S3, which an edit replaces, so they are read from the code env as it is now.
export type CodeEnvSnapshot = {
    id: string
    language: Language
    dataSourceType: string | null
    url: string
    settings: OrgCodeEnvSettings
    commandLines: CommandLines
}
