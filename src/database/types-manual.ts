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
// org's code envs cannot change what the study runs. Keys match the orgCodeEnv columns. The identifier
// and starter code file names are left out and read from the code env as it is now, because an edit
// replaces the starter code files in S3.
export type CodeEnvSnapshot = {
    id: string
    language: Language
    url: string
    settings: OrgCodeEnvSettings
    commandLines: CommandLines
}
