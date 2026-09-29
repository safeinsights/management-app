import type { Route } from 'next'
import { extractOrgSlugFromPath } from '@/lib/paths'
import { safeRedirectUrl } from '@/lib/utils'
import { appPageAccess, isOrgAdminPath, ORG_SLUG_TOKEN, pathUnderOrg, type PageAccess } from './access'
import type { RouteBuilder } from './builder'
import { Routes, StudyParams, type OrgParams } from './definitions'

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
    | { kind: 'orgPage'; orgSlug: string; title: string; needsOrgAdmin: boolean }
    | { kind: 'appPage'; title: string; category: string | null; access: PageAccess }

/**
 * Titles are the headings these pages actually show. Pages whose heading is a record or a live form
 * value are resolved instead, and pages with no heading of their own are left out on purpose. Who
 * may open each one is not stored: `appPageAccess` derives it from the path.
 */
const APP_PAGES: Record<string, { title: string; category: string | null }> = {
    [Routes.dashboard]: { title: 'My dashboard', category: null },
    [Routes.userKey]: { title: 'Security key', category: 'Account' },
    [Routes.accountKeys]: { title: 'Security key', category: 'Account' },
    [Routes.researcherProfile]: { title: 'Researcher profile', category: null },
    [Routes.legal]: { title: 'Legal', category: null },
    [Routes.adminSafeinsights]: { title: 'Organizations', category: 'Admin' },
    [Routes.adminSafeinsightsLegal]: { title: 'SafeInsights Legal', category: 'Admin' },
}

/** The path a route builder produces, with the org slug stripped back off: `admin/team`. */
const underOrgPath = (route: RouteBuilder<typeof OrgParams>) =>
    pathUnderOrg(route({ orgSlug: ORG_SLUG_TOKEN }), ORG_SLUG_TOKEN)

/** Keyed by the path under the org slug. The category is the org's own name. */
const ORG_PAGES: Record<string, string> = {
    [underOrgPath(Routes.orgDashboard)]: 'Dashboard',
    [underOrgPath(Routes.adminSettings)]: 'Settings',
    [underOrgPath(Routes.adminTeam)]: 'Manage team',
    [underOrgPath(Routes.adminLegal)]: 'Legal center',
}

// Only ever built into a path shape, never followed, but the builder still validates it.
const STUDY_ID_TOKEN = '00000000-0000-7000-8000-000000000000'
const STUDY_SECTION = pathUnderOrg(
    Routes.studyView({ orgSlug: ORG_SLUG_TOKEN, studyId: STUDY_ID_TOKEN }),
    ORG_SLUG_TOKEN,
).split('/')[0]

const UNSAFE_PATH = '' as Route

/** A plain property read would also answer with `constructor` and the rest of Object.prototype. */
function registryEntry<T>(registry: Record<string, T>, key: string): T | undefined {
    return Object.hasOwn(registry, key) ? registry[key] : undefined
}

function normalizePath(pathname: string): string | null {
    if (!pathname.startsWith('/')) return null
    if (safeRedirectUrl(pathname, UNSAFE_PATH) !== pathname) return null

    const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
    return trimmed || '/'
}

function studyIdIn(orgSlug: string, path: string): string | null {
    const [section, studyId] = path.split('/')
    if (section !== STUDY_SECTION || !studyId) return null

    return StudyParams.safeParse({ orgSlug, studyId }).success ? studyId : null
}

/** Null for a path this app does not recognize, which includes every path of another origin. */
export function matchInternalRoute(pathname: string): InternalRouteMatch | null {
    const path = normalizePath(pathname)
    if (!path) return null

    const appPage = registryEntry(APP_PAGES, path)
    if (appPage) return { kind: 'appPage', ...appPage, access: appPageAccess(path) }

    const orgSlug = extractOrgSlugFromPath(path)
    if (!orgSlug) return null

    const underOrg = pathUnderOrg(path, orgSlug)

    const studyId = studyIdIn(orgSlug, underOrg)
    if (studyId) return { kind: 'study', orgSlug, studyId }

    const title = registryEntry(ORG_PAGES, underOrg)
    if (title) return { kind: 'orgPage', orgSlug, title, needsOrgAdmin: isOrgAdminPath(path) }

    return null
}
