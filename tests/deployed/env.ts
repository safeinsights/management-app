import type { StableTarget } from './config'
import { totp } from './totp'

// The per-environment accounts, read with qa-review's variable names (qa-review/config/environments.ts):
// <ROLE>_EMAIL_<ENV>, <ROLE>_PASSWORD_<ENV>, and a second factor that is either <ROLE>_MFA_SEED_<ENV>
// (base32 TOTP, wins when both are set) or <ROLE>_MFA_CODE_<ENV> (a fixed code, as Clerk's test mode
// uses). <ROLE>_RESULTS_PRIVATE_KEY_<ENV> is the PEM that opens outputs encrypted to that account.

export type DeployedRole = 'admin' | 'researcher' | 'reviewer'
export const DEPLOYED_ROLES: DeployedRole[] = ['admin', 'researcher', 'reviewer']

export type SecondFactor = { kind: 'totp'; seed: string } | { kind: 'code'; code: string }

export type Account = {
    role: DeployedRole
    email: string
    password: string
    secondFactor: SecondFactor
    resultsPrivateKey?: string
}

type Vars = Record<string, string | undefined>

const varName = (role: DeployedRole, field: string, env: StableTarget) =>
    `${role.toUpperCase()}_${field}_${env.toUpperCase()}`

// A code expires every 30 seconds and a run lasts minutes, so it is computed when it is typed.
export function currentCode(secondFactor: SecondFactor): string {
    return secondFactor.kind === 'totp' ? totp(secondFactor.seed) : secondFactor.code
}

export function accountFor(role: DeployedRole, env: StableTarget, vars: Vars = process.env): Account {
    const read = (field: string) => {
        const value = vars[varName(role, field, env)]
        if (!value) throw new Error(`Missing ${varName(role, field, env)} in .env.deployed`)
        return value
    }
    const seed = vars[varName(role, 'MFA_SEED', env)]
    const code = vars[varName(role, 'MFA_CODE', env)]
    if (!seed && !code) {
        throw new Error(
            `Missing ${varName(role, 'MFA_SEED', env)} or ${varName(role, 'MFA_CODE', env)} in .env.deployed`,
        )
    }
    // A PEM in a dotenv file is usually stored with escaped newlines.
    const pem = vars[varName(role, 'RESULTS_PRIVATE_KEY', env)]
    return {
        role,
        email: read('EMAIL'),
        password: read('PASSWORD'),
        secondFactor: seed ? { kind: 'totp', seed } : { kind: 'code', code: code! },
        resultsPrivateKey: pem ? pem.replace(/\\n/g, '\n') : undefined,
    }
}

// Whether every role can sign in. The anonymous smoke checks run without this; everything that
// signs in skips with a message naming what is missing.
export function missingCredentials(env: StableTarget, vars: Vars = process.env): string[] {
    const missing: string[] = []
    for (const role of DEPLOYED_ROLES) {
        for (const field of ['EMAIL', 'PASSWORD'])
            if (!vars[varName(role, field, env)]) missing.push(varName(role, field, env))
        if (!vars[varName(role, 'MFA_SEED', env)] && !vars[varName(role, 'MFA_CODE', env)]) {
            missing.push(`${varName(role, 'MFA_SEED', env)} or ${varName(role, 'MFA_CODE', env)}`)
        }
    }
    return missing
}
