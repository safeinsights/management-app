import { describe, expect, it } from 'vitest'
import { inviteLandingUrl } from './invite-landing'

describe('inviteLandingUrl', () => {
    const inviteId = '019f38c6-804c-70ac-b02a-a4b87d432bc2'

    it('lands on the org dashboard when the invite was addressed to the accepting account', () => {
        expect(inviteLandingUrl(inviteId, 'openstax-lab', 'me@example.com', 'me@example.com')).toBe(
            '/openstax-lab/dashboard',
        )
    })

    // Clerk normalizes addresses to lower case, the invite table does not.
    it('ignores case when comparing the two addresses', () => {
        expect(inviteLandingUrl(inviteId, 'openstax-lab', 'Me@Example.com', 'me@example.com')).toBe(
            '/openstax-lab/dashboard',
        )
    })

    it('routes to the linking screen when the invite was addressed to another email', () => {
        expect(inviteLandingUrl(inviteId, 'openstax-lab', 'invited@example.com', 'me@example.com')).toBe(
            `/account/invitation/${inviteId}/link-email`,
        )
    })

    it('routes to the linking screen when the account has no stored address', () => {
        expect(inviteLandingUrl(inviteId, 'openstax-lab', 'invited@example.com', null)).toBe(
            `/account/invitation/${inviteId}/link-email`,
        )
    })
})
