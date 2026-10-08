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

// A study's own copy of the code env chosen for its language (SHRMP-271), so later edits to the
// org's code envs cannot change what the study runs. Keys match the orgCodeEnv columns.
export type CodeEnvSnapshot = {
    id: string
    identifier: string
    language: Language
    dataSourceType: string | null
    url: string
    settings: OrgCodeEnvSettings
    commandLines: CommandLines
    starterCodeFileNames: string[]
    sampleDataPath: string | null
}
