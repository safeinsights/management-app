import type { OrgType } from '@/database/types'
import { ExternalLinks, Routes } from '@/lib/routes'
import type { StudyRole } from '@/lib/study-screen/state.types'

export type NavOrg = {
    id: string
    name: string
    slug: string
    type: OrgType
    isAdmin: boolean
}

// Which side nav rows carry the unread dot (OTTER-838). The query adds the user id, so writes that
// change it invalidate by this prefix.
export const NAV_UNREAD_QUERY_KEY = ['nav-unread']

// My studies has one flag per tab, so either tab's table can patch its own half.
export type NavUnread = { myStudies: Record<StudyRole, boolean>; orgSlugs: string[] }

export const NOTHING_UNREAD: NavUnread = { myStudies: { researcher: false, reviewer: false }, orgSlugs: [] }

export const hasMyStudiesUnread = (unread: NavUnread) => unread.myStudies.researcher || unread.myStudies.reviewer

type NavScope = { scope: 'org' | 'user'; audience: StudyRole; orgSlug: string }

// A table's fresh rows answer its own scope's dot, so it patches that one instead of refetching all.
export function withScopeUnread(nav: NavUnread, { scope, audience, orgSlug }: NavScope, isUnread: boolean): NavUnread {
    if (scope === 'user') return { ...nav, myStudies: { ...nav.myStudies, [audience]: isUnread } }
    const otherOrgs = nav.orgSlugs.filter((slug) => slug !== orgSlug)
    return { ...nav, orgSlugs: isUnread ? [...otherOrgs, orgSlug] : otherOrgs }
}

export type NavIcon = 'house' | 'dashboard' | 'settings' | 'team' | 'legal' | 'catalog' | 'resources' | 'support'

export type NavItem = {
    label: string
    url: string
    icon: NavIcon
}

const isDataPartner = (org: NavOrg) => org.type === 'enclave'
const isResearchLab = (org: NavOrg) => org.type === 'lab'

const byName = (a: NavOrg, b: NavOrg) => a.name.localeCompare(b.name)

const adminsFirst = (orgs: NavOrg[]) => [
    ...orgs.filter((org) => org.isAdmin).sort(byName),
    ...orgs.filter((org) => !org.isAdmin).sort(byName),
]

// Data Partner orgs, then Research Lab orgs; inside each group the ones the user administers lead.
export function orderNavOrgs(orgs: NavOrg[]): NavOrg[] {
    return [...adminsFirst(orgs.filter(isDataPartner)), ...adminsFirst(orgs.filter(isResearchLab))]
}

export function orgSubnav(org: NavOrg): NavItem[] {
    const { slug: orgSlug } = org
    const items: NavItem[] = [{ label: 'Dashboard', url: Routes.orgDashboard({ orgSlug }), icon: 'dashboard' }]
    if (!org.isAdmin) return items

    if (isDataPartner(org)) {
        items.push({ label: 'Admin settings', url: Routes.adminSettings({ orgSlug }), icon: 'settings' })
    }
    items.push({ label: 'Manage team', url: Routes.adminTeam({ orgSlug }), icon: 'team' })
    items.push({ label: 'Legal center', url: Routes.adminLegal({ orgSlug }), icon: 'legal' })
    return items
}

export function externalNavLinks(orgs: NavOrg[]): NavItem[] {
    const links: NavItem[] = []
    if (orgs.some(isResearchLab)) {
        links.push({ label: 'Data catalog', url: ExternalLinks.dataCatalog, icon: 'catalog' })
    }
    if (orgs.some(isDataPartner)) {
        links.push({ label: 'Resource center', url: ExternalLinks.resourceCenter, icon: 'resources' })
    }
    links.push({ label: 'Support', url: ExternalLinks.support, icon: 'support' })
    return links
}

const isUnder = (pathname: string, url: string) => pathname === url || pathname.startsWith(`${url}/`)

// Inside an open group exactly one row reads as current: the admin page being viewed, otherwise the
// dashboard, which also covers the org's study pages (OTTER-692 Figma note: Dashboard stays
// highlighted on a study page and clicking it acts as a reset).
export function selectedSubnavUrl(pathname: string, org: NavOrg): string {
    const dashboard = Routes.orgDashboard({ orgSlug: org.slug })
    const adminMatch = orgSubnav(org).find((item) => item.url !== dashboard && isUnder(pathname, item.url))
    return adminMatch?.url ?? dashboard
}
