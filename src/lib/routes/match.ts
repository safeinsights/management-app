import type { Route } from 'next'
import { extractOrgSlugFromPath } from '@/lib/paths'
import { safeRedirectUrl } from '@/lib/utils'
import { StudyParams } from './definitions'

/**
 * What a link preview can say about a destination inside the app. `unknown` covers a real page the
 * registry below does not name, which the card falls back to showing as a plain URL, and is kept
 * distinct from `unavailable`, which means deleted or out of reach.
 */
export type ResolvedInternalLink =
    | { kind: 'internal'; title: string; category: string | null }
    | { kind: 'unavailable' }
    | { kind: 'unknown' }

export type InternalRouteMatch =
    | { kind: 'study'; orgSlug: string; studyId: string }
    | { kind: 'orgPage'; orgSlug: string; title: string }
    | { kind: 'appPage'; title: string; category: string | null }

/**
 * Titles are the headings these pages actually show. Pages whose heading is a record or a live form
 * value are resolved instead, and pages with no heading of their own are left out on purpose.
 */
const APP_PAGES: Record<string, { title: string; category: string | null }> = {
    '/dashboard': { title: 'My dashboard', category: null },
    '/user-key': { title: 'Security key', category: 'Account' },
    '/account/keys': { title: 'Security key', category: 'Account' },
    '/researcher/profile': { title: 'Researcher profile', category: null },
    '/legal': { title: 'Legal', category: null },
    '/admin/safeinsights': { title: 'Organizations', category: 'Admin' },
    '/admin/safeinsights/legal': { title: 'SafeInsights Legal', category: 'Admin' },
}

/** Keyed by the path under the org slug. The category is the org's own name. */
const ORG_PAGES: Record<string, string> = {
    dashboard: 'Dashboard',
    'admin/settings': 'Settings',
    'admin/team': 'Manage team',
    'admin/legal': 'Legal center',
}

const UNSAFE_PATH = '' as Route

function normalizePath(pathname: string): string | null {
    if (!pathname.startsWith('/')) return null
    if (safeRedirectUrl(pathname, UNSAFE_PATH) !== pathname) return null

    const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
    return trimmed || '/'
}

function studyIdIn(orgSlug: string, path: string): string | null {
    const [section, studyId] = path.split('/')
    if (section !== 'study' || !studyId) return null

    return StudyParams.safeParse({ orgSlug, studyId }).success ? studyId : null
}

/** Null for a path this app does not recognize, which includes every path of another origin. */
export function matchInternalRoute(pathname: string): InternalRouteMatch | null {
    const path = normalizePath(pathname)
    if (!path) return null

    const appPage = APP_PAGES[path]
    if (appPage) return { kind: 'appPage', title: appPage.title, category: appPage.category }

    const orgSlug = extractOrgSlugFromPath(path)
    if (!orgSlug) return null

    const underOrg = path.slice(orgSlug.length + 1).replace(/^\//, '')

    const studyId = studyIdIn(orgSlug, underOrg)
    if (studyId) return { kind: 'study', orgSlug, studyId }

    const orgPageTitle = ORG_PAGES[underOrg]
    if (orgPageTitle) return { kind: 'orgPage', orgSlug, title: orgPageTitle }

    return null
}
