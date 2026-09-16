import {
    describe,
    it,
    expect,
    mockSessionWithTestData,
    insertTestStudyData,
    insertTestOrg,
    BLANK_UUID,
} from '@/tests/unit.helpers'
import { displayOrgName } from '@/lib/string'
import { Routes } from '@/lib/routes'
import { resolveInternalLinkAction } from './link-preview.actions'

describe('resolveInternalLinkAction', () => {
    it('names a study the caller may view, with the org from the URL', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { studyId } = await insertTestStudyData({ org })

        const result = await resolveInternalLinkAction({
            pathname: `/${org.slug}/study/${studyId}/view`,
        })

        expect(result).toEqual({ kind: 'internal', title: 'my 1st study', category: displayOrgName(org.name) })
    })

    it('reports a study the caller has no access to as unavailable', async () => {
        const otherOrg = await insertTestOrg({ slug: 'other-lab', type: 'lab' })
        const { studyId } = await insertTestStudyData({ org: otherOrg })
        await mockSessionWithTestData({ orgType: 'lab' })

        const result = await resolveInternalLinkAction({
            pathname: `/${otherOrg.slug}/study/${studyId}/view`,
        })

        expect(result).toEqual({ kind: 'unavailable' })
    })

    it('reports a study that is not there as unavailable', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })

        const result = await resolveInternalLinkAction({ pathname: `/${org.slug}/study/${BLANK_UUID}/view` })

        expect(result).toEqual({ kind: 'unavailable' })
    })

    it('reports a study reached through an unrelated org as unavailable', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { studyId } = await insertTestStudyData({ org })
        const unrelated = await insertTestOrg({ slug: 'unrelated-lab', type: 'lab' })

        const result = await resolveInternalLinkAction({ pathname: `/${unrelated.slug}/study/${studyId}/view` })

        expect(result).toEqual({ kind: 'unavailable' })
    })

    it('names an org page for a member and refuses it for everyone else', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const outsider = await insertTestOrg({ slug: 'outsider-lab', type: 'lab' })

        expect(await resolveInternalLinkAction({ pathname: `/${org.slug}/dashboard` })).toEqual({
            kind: 'internal',
            title: 'Dashboard',
            category: displayOrgName(org.name),
        })
        expect(await resolveInternalLinkAction({ pathname: `/${outsider.slug}/dashboard` })).toEqual({
            kind: 'unavailable',
        })
    })

    it('names a fixed app page without touching the database', async () => {
        await mockSessionWithTestData()

        expect(await resolveInternalLinkAction({ pathname: '/user-key' })).toEqual({
            kind: 'internal',
            title: 'Security key',
            category: 'Account',
        })
    })

    it('refuses an SI admin page to everyone but an SI admin', async () => {
        await mockSessionWithTestData()

        expect(await resolveInternalLinkAction({ pathname: Routes.adminSafeinsights })).toEqual({
            kind: 'unavailable',
        })

        await mockSessionWithTestData({ isSiAdmin: true })

        expect(await resolveInternalLinkAction({ pathname: Routes.adminSafeinsights })).toEqual({
            kind: 'internal',
            title: 'Organizations',
            category: 'Admin',
        })
    })

    it('refuses an org admin page to a member who does not administer that org', async () => {
        const member = await mockSessionWithTestData({ orgType: 'lab', isAdmin: false })

        expect(await resolveInternalLinkAction({ pathname: Routes.adminTeam({ orgSlug: member.org.slug }) })).toEqual({
            kind: 'unavailable',
        })

        const admin = await mockSessionWithTestData({ orgType: 'lab', isAdmin: true })

        expect(await resolveInternalLinkAction({ pathname: Routes.adminTeam({ orgSlug: admin.org.slug }) })).toEqual({
            kind: 'internal',
            title: 'Manage team',
            category: displayOrgName(admin.org.name),
        })
    })

    it('refuses the researcher profile to a caller who belongs to no lab', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        expect(await resolveInternalLinkAction({ pathname: Routes.researcherProfile })).toEqual({
            kind: 'unavailable',
        })

        await mockSessionWithTestData({ orgType: 'lab' })

        expect(await resolveInternalLinkAction({ pathname: Routes.researcherProfile })).toEqual({
            kind: 'internal',
            title: 'Researcher profile',
            category: null,
        })
    })

    it('reports a path it does not recognize as unknown, so the card shows the URL', async () => {
        await mockSessionWithTestData()

        expect(await resolveInternalLinkAction({ pathname: '/about' })).toEqual({ kind: 'unknown' })
        expect(await resolveInternalLinkAction({ pathname: '//evil.example.com' })).toEqual({ kind: 'unknown' })
    })
})
