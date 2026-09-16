import { describe, expect, it } from '@/tests/unit.helpers'
import { appPageAccess, isOrgAdminPath, isResearcherPath, isSiAdminPath } from './access'

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
