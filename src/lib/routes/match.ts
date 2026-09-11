import type { Route } from 'next'
import { extractOrgSlugFromPath } from '@/lib/paths'
import { safeRedirectUrl } from '@/lib/utils'
import { Routes, StudyParams } from './definitions'

/**
 * What a link preview can say about a destination inside the app. `unknown` covers a real page the
 * registry below does not name, which the card falls back to showing as a plain URL, and is kept
 * distinct from `unavailable`, which means deleted or out of reach.
 */
export type ResolvedInternalLink =
    | { kind: 'internal'; title: string; category: string | null }
    | { kind: 'unavailable' }
    | { kind: 'unknown' }

/**
 * What the caller must be for the page to open, mirroring the guards in `proxy.ts`. A preview that
 * named a page the caller cannot reach would promise a destination that bounces them home.
 */
export type PageAccess = 'siAdmin' | 'researcher' | null

export type InternalRouteMatch =
    | { kind: 'study'; orgSlug: string; studyId: string }
    | { kind: 'orgPage'; orgSlug: string; title: string; needsOrgAdmin: boolean }
    | { kind: 'appPage'; title: string; category: string | null; access: PageAccess }

/**
 * Titles are the headings these pages actually show. Pages whose heading is a record or a live form
 * value are resolved instead, and pages with no heading of their own are left out on purpose.
 */
const APP_PAGES: Record<string, { title: string; category: string | null; access: PageAccess }> = {
    [Routes.dashboard]: { title: 'My dashboard', category: null, access: null },
    [Routes.userKey]: { title: 'Security key', category: 'Account', access: null },
    [Routes.accountKeys]: { title: 'Security key', category: 'Account', access: null },
    [Routes.researcherProfile]: { title: 'Researcher profile', category: null, access: 'researcher' },
    [Routes.legal]: { title: 'Legal', category: null, access: null },
    [Routes.adminSafeinsights]: { title: 'Organizations', category: 'Admin', access: 'siAdmin' },
    [Routes.adminSafeinsightsLegal]: { title: 'SafeInsights Legal', category: 'Admin', access: 'siAdmin' },
}

/** Keyed by the path under the org slug. The category is the org's own name. */
const ORG_PAGES: Record<string, { title: string; needsOrgAdmin: boolean }> = {
    dashboard: { title: 'Dashboard', needsOrgAdmin: false },
    'admin/settings': { title: 'Settings', needsOrgAdmin: true },
    'admin/team': { title: 'Manage team', needsOrgAdmin: true },
    'admin/legal': { title: 'Legal center', needsOrgAdmin: true },
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
    if (appPage) return { kind: 'appPage', ...appPage }

    const orgSlug = extractOrgSlugFromPath(path)
    if (!orgSlug) return null

    const underOrg = path.slice(orgSlug.length + 1).replace(/^\//, '')

    const studyId = studyIdIn(orgSlug, underOrg)
    if (studyId) return { kind: 'study', orgSlug, studyId }

    const orgPage = ORG_PAGES[underOrg]
    if (orgPage) return { kind: 'orgPage', orgSlug, ...orgPage }

    return null
}
