import { extractOrgSlugFromPath } from '@/lib/paths'
import { Routes } from './definitions'

/**
 * What the caller must be for a page to open; null is any signed-in user. Mirrors nothing: this and
 * the predicates below are the single answer to "who can open this path", which `proxy.ts` enforces
 * and a link preview reads so it cannot name a page that bounces the reader home.
 */
export type PageAccess = 'siAdmin' | 'researcher' | null

/** Stands in for a real slug where a route builder is used to name a path shape, not a page. */
export const ORG_SLUG_TOKEN = '__org__'

/** The part of an absolute path that follows `/<orgSlug>`, with no leading slash. */
export function pathUnderOrg(pathname: string, orgSlug: string): string {
    return pathname.slice(orgSlug.length + 1).replace(/^\//, '')
}

/** `/researcher/profile` to `/researcher`. */
function subtreeRoot(path: string): string {
    const next = path.indexOf('/', 1)
    return next === -1 ? path : path.slice(0, next)
}

// Subtree roots rather than pages, read off a route that lives inside each one. Plain string checks
// and not route patterns: Clerk's path-to-regexp fork reads Next's `[param]` brackets as literals
// and silently matches nothing, which is how MA-11 left a guard dead.
const SI_ADMIN_PREFIX: string = Routes.adminSafeinsights
const RESEARCHER_PREFIX = subtreeRoot(Routes.researcherProfile)
const ORG_ADMIN_SECTION = pathUnderOrg(Routes.adminSettings({ orgSlug: ORG_SLUG_TOKEN }), ORG_SLUG_TOKEN).split('/')[0]

export function isSiAdminPath(pathname: string): boolean {
    return pathname.startsWith(SI_ADMIN_PREFIX)
}

export function isResearcherPath(pathname: string): boolean {
    return pathname.startsWith(RESEARCHER_PREFIX)
}

/** False for a path with no org slug, so `/admin/safeinsights` is not read as an org admin page. */
export function isOrgAdminPath(pathname: string): boolean {
    const orgSlug = extractOrgSlugFromPath(pathname)
    if (!orgSlug) return false

    return pathUnderOrg(pathname, orgSlug).startsWith(ORG_ADMIN_SECTION)
}

/** What a page outside any org requires, from the same two subtrees the guards above gate. */
export function appPageAccess(pathname: string): PageAccess {
    if (isSiAdminPath(pathname)) return 'siAdmin'
    if (isResearcherPath(pathname)) return 'researcher'

    return null
}
