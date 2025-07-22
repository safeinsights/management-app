import { db } from '@/database'
import { Paper, Title } from '@mantine/core'
import { redirect } from 'next/navigation'
import { AccountPanel } from './account-form'
import { AddTeam } from './add-team'
import { AlreadyMember } from './already-member'

export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
    const { inviteId } = await params

    const invite = await db
        .selectFrom('pendingUser')
        .innerJoin('org', 'pendingUser.orgId', 'org.id')
        .leftJoin('user', 'user.email', 'pendingUser.email')
        .leftJoin('orgUser', (join) =>
            join.onRef('orgUser.orgId', '=', 'pendingUser.orgId').onRef('orgUser.userId', '=', 'user.id'),
        )
        .select(['pendingUser.email', 'org.name as orgName', 'user.id as matchingUser', 'orgUser.id as matchingTeam'])
        .whereRef('org.id', '=', 'pendingUser.orgId')
        .where('pendingUser.claimedByUserId', 'is', null)
        .where('pendingUser.id', '=', inviteId)
        .executeTakeFirst()

    if (!invite) {
        redirect('/')
    }

    let body: React.ReactNode = null

    if (invite.matchingTeam) {
        body = <AlreadyMember inviteId={inviteId} orgName={invite.orgName} />
    } else if (invite.matchingUser) {
        body = <AddTeam inviteId={inviteId} orgName={invite.orgName} />
    } else {
        body = <AccountPanel inviteId={inviteId} email={invite.email} orgName={invite.orgName} />
    }

    return (
        <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
            <Title mb="md" ta="center" order={3}>
                Welcome to SafeInsights!
            </Title>
            {body}
        </Paper>
    )
}
