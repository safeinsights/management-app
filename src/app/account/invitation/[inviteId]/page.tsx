import { db } from '@/database'
import { ErrorAlert } from '@/components/errors'
import { Container } from '@mantine/core'
import { InvitationHandler } from './invitation-handler'

export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
    const { inviteId } = await params

    const invite = await db
        .selectFrom('pendingUser')
        .innerJoin('org', 'org.id', 'pendingUser.orgId')
        .select(['pendingUser.email', 'org.name as orgName'])
        .where('claimedByUserId', 'is', null)
        .where('pendingUser.id', '=', inviteId)
        .executeTakeFirst()

    if (!invite) return <ErrorAlert error="Invalid or already claimed invitation." />

    return (
        <Container>
            <InvitationHandler inviteId={inviteId} invitedEmail={invite.email} orgName={invite.orgName} />
        </Container>
    )
}
