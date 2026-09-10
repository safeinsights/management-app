import { describe, it, expect } from '@/tests/unit.helpers'
import { matchInternalRoute } from './match'

const STUDY_ID = '01a0011e-b0b2-7618-9ca5-5caa61bc30d3'

describe('matchInternalRoute', () => {
    it('matches a study by id on any of its sub-routes', () => {
        const expected = { kind: 'study', orgSlug: 'openstax-lab', studyId: STUDY_ID }

        expect(matchInternalRoute(`/openstax-lab/study/${STUDY_ID}/view`)).toEqual(expected)
        expect(matchInternalRoute(`/openstax-lab/study/${STUDY_ID}/review/proposal`)).toEqual(expected)
        expect(matchInternalRoute(`/openstax-lab/study/${STUDY_ID}`)).toEqual(expected)
    })

    it('does not treat a study path without a real id as a study', () => {
        expect(matchInternalRoute('/openstax-lab/study/request')).toBeNull()
        expect(matchInternalRoute('/openstax-lab/study/12345')).toBeNull()
    })

    it('matches the org pages that carry a fixed heading', () => {
        expect(matchInternalRoute('/openstax-lab/dashboard')).toEqual({
            kind: 'orgPage',
            orgSlug: 'openstax-lab',
            title: 'Dashboard',
            needsOrgAdmin: false,
        })
        expect(matchInternalRoute('/openstax-lab/admin/team')).toEqual({
            kind: 'orgPage',
            orgSlug: 'openstax-lab',
            title: 'Manage team',
            needsOrgAdmin: true,
        })
    })

    it('matches the app pages that carry a fixed heading', () => {
        expect(matchInternalRoute('/dashboard')).toEqual({
            kind: 'appPage',
            title: 'My dashboard',
            category: null,
            access: null,
        })
        expect(matchInternalRoute('/user-key')).toEqual({
            kind: 'appPage',
            title: 'Security key',
            category: 'Account',
            access: null,
        })
        expect(matchInternalRoute('/admin/safeinsights')).toEqual({
            kind: 'appPage',
            title: 'Organizations',
            category: 'Admin',
            access: 'siAdmin',
        })
        expect(matchInternalRoute('/researcher/profile')).toEqual({
            kind: 'appPage',
            title: 'Researcher profile',
            category: null,
            access: 'researcher',
        })
    })

    it('ignores a trailing slash', () => {
        expect(matchInternalRoute('/dashboard/')).toEqual({
            kind: 'appPage',
            title: 'My dashboard',
            category: null,
            access: null,
        })
    })

    it('returns null for a page it does not name', () => {
        expect(matchInternalRoute('/about')).toBeNull()
        expect(matchInternalRoute('/account/mfa')).toBeNull()
        expect(matchInternalRoute('/openstax-lab/something-else')).toBeNull()
        expect(matchInternalRoute('/')).toBeNull()
    })

    it('refuses a path that is not a plain absolute path', () => {
        expect(matchInternalRoute('dashboard')).toBeNull()
        expect(matchInternalRoute('//evil.example.com')).toBeNull()
        expect(matchInternalRoute('/../dashboard')).toBeNull()
        expect(matchInternalRoute('/dash\\board')).toBeNull()
    })
})
