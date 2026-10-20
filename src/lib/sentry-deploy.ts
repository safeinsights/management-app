const ENVIRONMENT_ATTRIBUTE = 'data-sentry-environment'
const RELEASE_ATTRIBUTE = 'data-sentry-release'

export type DeployEnv = Record<string, string | undefined>

export function sentryDeployOptions(environment?: string | null, release?: string | null) {
    return { environment: environment || 'development', release: release || 'unknown' }
}

export function sentryDeployOptionsFromEnv(env: DeployEnv = process.env) {
    return sentryDeployOptions(env.ENVIRONMENT_ID, env.RELEASE_TAG)
}

// One build serves every environment, so the browser bundle cannot inline these. The root layout
// renders the server's runtime values onto <html> instead (OTTER-879).
export function sentryDeployAttributes(env: DeployEnv = process.env) {
    return { [ENVIRONMENT_ATTRIBUTE]: env.ENVIRONMENT_ID, [RELEASE_ATTRIBUTE]: env.RELEASE_TAG }
}

// <html> exists before any script runs, so the attributes are readable when Sentry initializes.
export function sentryDeployOptionsFromDocument(root: Element = document.documentElement) {
    return sentryDeployOptions(root.getAttribute(ENVIRONMENT_ATTRIBUTE), root.getAttribute(RELEASE_ATTRIBUTE))
}
