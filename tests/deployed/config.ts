// Every number the deployed suite waits on, in one place: the specs name these and never write a
// timeout inline (tests/no-inline-deployed-timeouts.mjs enforces it). Starting values; tune them
// from measured runs, not from failures.
export const DEPLOYED_ACTION_TIMEOUT = 30_000
// Aurora Serverless v2 scales to zero on non-production environments; the first request after an
// idle period can take tens of seconds.
export const DEPLOYED_NAV_TIMEOUT = 60_000
export const DEPLOYED_EXPECT_TIMEOUT = 30_000
export const SMOKE_TEST_TIMEOUT = 2 * 60_000
export const STAGE_TEST_TIMEOUT = 5 * 60_000
export const CODEBUILD_SCAN_TIMEOUT = 6 * 60_000
export const AI_REVIEW_TIMEOUT = 10 * 60_000
export const CONTAINERIZER_TIMEOUT = 10 * 60_000
export const ENCLAVE_RUN_TIMEOUT = 25 * 60_000
export const CODER_LAUNCH_TIMEOUT = 8 * 60_000
export const INVITE_EMAIL_TIMEOUT = 3 * 60_000
export const POLL_INTERVAL = 15_000
// Studies this suite created and failed to delete are swept when older than this.
export const STALE_STUDY_AFTER_MS = 3 * 60 * 60_000

export const STABLE_TARGETS = ['qa', 'staging', 'production', 'demo'] as const
export type StableTarget = (typeof STABLE_TARGETS)[number]

export type Target = {
    // `qa`, `staging`, `production`, `demo` or `pr123`
    name: string
    kind: 'env' | 'pr'
    baseURL: string
    host: string
    // `qa.safeinsights.org`; Coder and the editor hang off it.
    zone: string
    coderURL: string
    // Which environment's accounts and keys to read: PR previews share Dev's (`qa`).
    accountsEnv: StableTarget
    // A PR preview has no enclave polling its database and no editor websocket.
    hasEnclave: boolean
    hasEditor: boolean
    // Mutating smoke checks stay off production and demo unless E2E_SMOKE_MUTATE=1.
    isProdLike: boolean
    expectedRelease?: string
}

export const PR_PREVIEW_ZONE = 'qa.safeinsights.org'

export function resolveTarget(vars: Record<string, string | undefined> = process.env): Target {
    const name = vars.E2E_TARGET ?? 'qa'
    const expectedRelease = vars.E2E_EXPECTED_RELEASE || undefined

    const pr = name.match(/^pr(\d+)$/)
    if (pr) {
        const host = `pr${pr[1]}.${PR_PREVIEW_ZONE}`
        return {
            name,
            kind: 'pr',
            baseURL: `https://${host}`,
            host,
            zone: PR_PREVIEW_ZONE,
            coderURL: `https://coder.${PR_PREVIEW_ZONE}`,
            accountsEnv: 'qa',
            hasEnclave: false,
            hasEditor: false,
            isProdLike: false,
            expectedRelease,
        }
    }

    if (!STABLE_TARGETS.includes(name as StableTarget)) {
        throw new Error(`Unknown E2E_TARGET "${name}". Use one of ${STABLE_TARGETS.join(', ')}, or pr<number>.`)
    }
    const stable = name as StableTarget
    const urlVar = `${stable.toUpperCase()}_BASE_URL`
    const baseURL = vars[urlVar]
    if (!baseURL) throw new Error(`${urlVar} is not set; put it in .env.deployed (same names as qa-review).`)
    const host = new URL(baseURL).host
    const zone = host.replace(/^app\./, '')
    return {
        name,
        kind: 'env',
        baseURL,
        host,
        zone,
        coderURL: `https://coder.${zone}`,
        accountsEnv: stable,
        hasEnclave: stable !== 'demo',
        hasEditor: true,
        isProdLike: stable === 'production' || stable === 'demo',
        expectedRelease,
    }
}
