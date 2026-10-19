import { describe, expect, it } from '@/tests/unit.helpers'
import { appPageAccess, isAccountSubtree, isOrgAdminPath, isResearcherPath, isSiAdminPath } from './access'

// These are the guards `proxy.ts` enforces, so the cases here are the ones the middleware has to
// keep answering the same way now that a link preview reads them too.
describe('isSiAdminPath', () => {
    it('covers the SI admin subtree and nothing else', () => {
        expect(isSiAdminPath('/admin/safeinsights')).toBe(true)
        expect(isSiAdminPath('/admin/safeinsights/legal')).toBe(true)

        expect(isSiAdminPath('/acme/admin/team')).toBe(false)
        expect(isSiAdminPath('/dashboard')).toBe(false)
    })
})

describe('isResearcherPath', () => {
    it('covers the researcher subtree and nothing else', () => {
        expect(isResearcherPath('/researcher')).toBe(true)
        expect(isResearcherPath('/researcher/profile')).toBe(true)

        expect(isResearcherPath('/acme/dashboard')).toBe(false)
        expect(isResearcherPath('/dashboard')).toBe(false)
    })
})

describe('isAccountSubtree', () => {
    it('covers the whole account subtree, including pages that need a session', () => {
        expect(isAccountSubtree('/account')).toBe(true)
        expect(isAccountSubtree('/account/signin')).toBe(true)
        expect(isAccountSubtree('/account/mfa/sms')).toBe(true)
        expect(isAccountSubtree('/account/keys')).toBe(true)
        expect(isAccountSubtree('/account/invitation/0192f1c4-7a3e-7cc1-9a51-3f2f0e6b8d10/join-team')).toBe(true)
        // A plain prefix, like the other subtree checks in this module.
        expect(isAccountSubtree('/accounting')).toBe(true)

        expect(isAccountSubtree('/dashboard')).toBe(false)
        expect(isAccountSubtree('/acme/admin/team')).toBe(false)
        expect(isAccountSubtree('/researcher/profile')).toBe(false)
    })
})

describe('isOrgAdminPath', () => {
    it('gates a bare org admin path as well as its pages', () => {
        expect(isOrgAdminPath('/acme/admin')).toBe(true)
        expect(isOrgAdminPath('/acme/admin/team')).toBe(true)
        expect(isOrgAdminPath('/acme/admin/settings')).toBe(true)
    })

    it('leaves non-admin and non-org paths alone', () => {
        expect(isOrgAdminPath('/acme')).toBe(false)
        expect(isOrgAdminPath('/acme/dashboard')).toBe(false)
        expect(isOrgAdminPath('/dashboard')).toBe(false)
        expect(isOrgAdminPath('/admin/safeinsights')).toBe(false)
        expect(isOrgAdminPath('/researcher/profile')).toBe(false)
    })
})

describe('appPageAccess', () => {
    it('names the role each subtree needs, and none for the rest', () => {
        expect(appPageAccess('/admin/safeinsights/legal')).toBe('siAdmin')
        expect(appPageAccess('/researcher/profile')).toBe('researcher')
        expect(appPageAccess('/dashboard')).toBeNull()
        expect(appPageAccess('/acme/admin/team')).toBeNull()
    })
})
