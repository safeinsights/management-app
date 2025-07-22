import { db } from '@/database'
import { redirect, RedirectType } from 'next/navigation'
import { SignOutPanel } from './signout-panel'
import { sessionFromClerk } from '@/server/clerk'
import { AlertNotFound } from '@/components/errors'

export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
    const session = await sessionFromClerk()
    if (session) {
        return <SignOutPanel />
    }

    const { inviteId } = await params

    const invite = await db
        .selectFrom('pendingUser')
        .innerJoin('org', 'pendingUser.orgId', 'org.id')
        .leftJoin('user', 'user.email', 'pendingUser.email')
        .leftJoin('orgUser', (join) =>
            join.onRef('orgUser.orgId', '=', 'pendingUser.orgId').onRef('orgUser.userId', '=', 'user.id'),
        )
        .select(['user.id as matchingUser', 'orgUser.id as matchingTeam'])
        .whereRef('org.id', '=', 'pendingUser.orgId')
        .where('pendingUser.claimedByUserId', 'is', null)
        .where('pendingUser.id', '=', inviteId)
        .executeTakeFirst()

    if (!invite) {
        return <AlertNotFound title="Unable to signup" message="unable to find invitation" />
    }

    if (invite.matchingTeam) {
        redirect(`/account/invitation/${inviteId}/exists`, RedirectType.replace)
    } else if (invite.matchingUser) {
        redirect(`/account/invitation/${inviteId}/join-team`, RedirectType.replace)
    } else {
        redirect(`/account/invitation/${inviteId}/signup`, RedirectType.replace)
    }
}
