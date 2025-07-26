import { db } from '@/database'
import { redirect, RedirectType } from 'next/navigation'
import { SignOutPanel } from './signout-panel'
import { sessionFromClerk } from '@/server/clerk'

export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
    const session = await sessionFromClerk()
    if (session) {
        return <SignOutPanel />
    }

    const { inviteId } = await params

    const pendingInvite = await db
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

    const claimedInvite = await db
        .selectFrom('pendingUser')
        .where('claimedByUserId', 'is not', null)
        .where('id', '=', inviteId)
        .executeTakeFirst()

    // if the invite has been claimed by a user, redirect to the signin page
    if (claimedInvite) {
        redirect(`/account/signin`, RedirectType.replace)
    }

    if (pendingInvite?.matchingTeam) {
        redirect(`/account/invitation/${inviteId}/exists`, RedirectType.replace)
    } else if (pendingInvite?.matchingUser) {
        redirect(`/account/invitation/${inviteId}/join-team`, RedirectType.replace)
    } else {
        redirect(`/account/invitation/${inviteId}/signup`, RedirectType.replace)
    }
}
