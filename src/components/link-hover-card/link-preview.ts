import { APP_NAME } from './copy'

export type LinkPreview =
    | { kind: 'external'; href: string }
    | { kind: 'internal'; href: string; title: string; category: string | null }
    | { kind: 'unavailable'; href: string }
    | { kind: 'loading'; href: string }

/**
 * The pathname of `href` when it points at this app, otherwise null. The client has no build-time
 * base URL, so the current origin is what decides internal from external. Parsed without a base on
 * purpose: every link the editor stores is absolute, so a string that needs one is not a link we
 * can resolve.
 */
export function internalPathname(href: string, origin: string): string | null {
    if (!origin) return null

    try {
        const url = new URL(href)
        if (url.origin !== origin) return null
        return url.pathname
    } catch {
        return null
    }
}

export function currentOrigin(): string {
    if (typeof window === 'undefined') return ''
    return window.location.origin
}

/** Middle dot with a space either side, appName alone when the destination has no category. */
export function formatCategoryLine(category: string | null): string {
    if (!category) return APP_NAME
    return `${APP_NAME} · ${category}`
}
