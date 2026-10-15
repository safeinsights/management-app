import { describe, expect, it } from '@/tests/unit.helpers'
import { ExternalLinks, Routes } from '@/lib/routes'
import {
    externalNavLinks,
    NOTHING_UNREAD,
    orderNavOrgs,
    orgSubnav,
    selectedSubnavUrl,
    withScopeUnread,
    type NavOrg,
} from './side-nav'

const org = (name: string, type: NavOrg['type'], isAdmin = false): NavOrg => ({
    id: name,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    type,
    isAdmin,
})

describe('orderNavOrgs', () => {
    it('groups data partners before research labs, admin orgs first and alphabetical within', () => {
        const ordered = orderNavOrgs([
            org('Zeta Lab', 'lab'),
            org('Alpha Lab', 'lab', true),
            org('Beta Partner', 'enclave'),
            org('Yankee Partner', 'enclave', true),
            org('Delta Lab', 'lab', true),
            org('Alpha Partner', 'enclave'),
        ])

        expect(ordered.map((o) => o.name)).toEqual([
            'Yankee Partner',
            'Alpha Partner',
            'Beta Partner',
            'Alpha Lab',
            'Delta Lab',
            'Zeta Lab',
        ])
    })
})

describe('orgSubnav', () => {
    it('shows only the dashboard to a member', () => {
        expect(orgSubnav(org('Lab', 'lab')).map((i) => i.label)).toEqual(['Dashboard'])
    })

    it('adds team and legal for a lab admin, and settings too for a data partner admin', () => {
        expect(orgSubnav(org('Lab', 'lab', true)).map((i) => i.label)).toEqual([
            'Dashboard',
            'Manage team',
            'Legal center',
        ])
        expect(orgSubnav(org('Partner', 'enclave', true)).map((i) => i.label)).toEqual([
            'Dashboard',
            'Admin settings',
            'Manage team',
            'Legal center',
        ])
    })
})

describe('externalNavLinks', () => {
    it('offers the catalog to lab members, the resource center to partner members, support to all', () => {
        expect(externalNavLinks([]).map((l) => l.label)).toEqual(['Support'])
        expect(externalNavLinks([org('Lab', 'lab')]).map((l) => l.url)).toEqual([
            ExternalLinks.dataCatalog,
            ExternalLinks.support,
        ])
        expect(externalNavLinks([org('Partner', 'enclave')]).map((l) => l.url)).toEqual([
            ExternalLinks.resourceCenter,
            ExternalLinks.support,
        ])
    })
})

describe('selectedSubnavUrl', () => {
    const partner = org('Partner', 'enclave', true)
    const orgSlug = partner.slug

    it('marks the admin page being viewed', () => {
        expect(selectedSubnavUrl(`${Routes.adminTeam({ orgSlug })}/invite`, partner)).toBe(
            Routes.adminTeam({ orgSlug }),
        )
    })

    it('falls back to the dashboard anywhere else inside the org, study pages included', () => {
        expect(selectedSubnavUrl(Routes.studyRequest({ orgSlug }), partner)).toBe(Routes.orgDashboard({ orgSlug }))
    })
})

describe('withScopeUnread', () => {
    it('sets only the My studies tab the table shows', () => {
        const nav = withScopeUnread(NOTHING_UNREAD, { scope: 'user', audience: 'reviewer', orgSlug: 'lab' }, true)

        expect(nav).toEqual({ myStudies: { researcher: false, reviewer: true }, orgSlugs: [] })
    })

    it('adds and removes only the table org, leaving the other orgs alone', () => {
        const nav = { ...NOTHING_UNREAD, orgSlugs: ['partner'] }
        const scope = { scope: 'org', audience: 'researcher', orgSlug: 'lab' } as const

        const marked = withScopeUnread(nav, scope, true)
        expect(marked.orgSlugs).toEqual(['partner', 'lab'])
        expect(withScopeUnread(marked, scope, true).orgSlugs).toEqual(['partner', 'lab'])
        expect(withScopeUnread(marked, scope, false).orgSlugs).toEqual(['partner'])
    })
})
