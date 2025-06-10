import { db } from '@/database'
import { ErrorAlert } from '@/components/errors'
import { Panel } from '@/components/panel'
import { Container } from '@mantine/core'
import { InvitationHandler } from './invitation-handler' // New client component

export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
    const { inviteId } = await params

    const invite = await db
        .selectFrom('pendingUser')
        .select(['email', 'orgId']) // Fetch orgId to potentially get orgName later if needed
        .where('claimedByUserId', 'is', null)
        .where('id', '=', inviteId)
        .executeTakeFirst()

    if (!invite) return <ErrorAlert error="Invalid or already claimed invitation." />

    return (
        <Container>
            <InvitationHandler inviteId={inviteId} invitedEmail={invite.email} />
        </Container>
    )
}
