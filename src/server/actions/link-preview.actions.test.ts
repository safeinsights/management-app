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

    it('reports a path it does not recognize as unknown, so the card shows the URL', async () => {
        await mockSessionWithTestData()

        expect(await resolveInternalLinkAction({ pathname: '/about' })).toEqual({ kind: 'unknown' })
        expect(await resolveInternalLinkAction({ pathname: '//evil.example.com' })).toEqual({ kind: 'unknown' })
    })
})
