// Shim for `@sentry/nextjs` in Ladle. Sentry's Next integration pulls in Next's
// client router internals (has-base-path etc.) which reference the Node `process`
// global — undefined under Vite — crashing any component whose import graph touches
// Sentry (e.g. via @/lib/utils). Error reporting has no meaning in an isolated
// component preview, so every export here is an inert no-op. Type-only imports
// (`import type { ErrorEvent } …`) are erased by esbuild and resolve against the
// real package during `tsc`, so they need nothing here.
const noop = (..._args: unknown[]): void => {}

const scope = {
    setTag: noop,
    setTags: noop,
    setExtra: noop,
    setExtras: noop,
    setContext: noop,
    setUser: noop,
    setLevel: noop,
    addBreadcrumb: noop,
}

export const captureException = noop
export const captureMessage = noop
export const captureEvent = noop
export const captureRouterTransitionStart = noop
export const init = noop
export const flush = async () => true
export const close = async () => true
export const setUser = noop
export const setTag = noop
export const setTags = noop
export const setExtra = noop
export const setContext = noop
export const addBreadcrumb = noop
export const withScope = (cb?: (s: typeof scope) => void) => {
    try {
        cb?.(scope)
    } catch {
        /* ignore */
    }
}
export const getCurrentScope = () => scope
export const getClient = () => undefined
export const setCurrentClient = noop
export const replayIntegration = () => ({})
export const browserTracingIntegration = () => ({})

export default {
    captureException,
    captureMessage,
    init,
    withScope,
    getCurrentScope,
    setUser,
    replayIntegration,
    browserTracingIntegration,
}
