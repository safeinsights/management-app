import { expect, it, vi } from 'vitest'
import { orgAdminInviteUserAction } from '@/app/admin/team/[orgSlug]/admin-users.actions'
import { mockSessionWithTestData } from '@/tests/unit.helpers'

it('fails when inviting an existing org member – case-insensitive', async () => {
    const { org, user } = await mockSessionWithTestData({
        isAdmin: true,
        orgSlug: 'openstax',
    })

    // user already belongs to org – duplicate invite
    await expect(
        orgAdminInviteUserAction({
            orgSlug: org.slug,
            invite: { email: user.email.toUpperCase(), role: 'researcher' },
        }),
    ).rejects.toMatchObject({
        message: expect.stringContaining('already associated'),
    })
})
