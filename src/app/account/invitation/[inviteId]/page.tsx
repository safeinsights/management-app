import { db } from '@/database'
import { ErrorAlert } from '@/components/errors'
import { Panel } from '@/components/panel'
import { Container } from '@mantine/core'
import { AccountPanel } from './account-form'

export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
    const { inviteId } = await params

    const invite = await db
        .selectFrom('pendingUser')
        .select('email')
        .where('claimedByUserId', 'is', null)
        .where('id', '=', inviteId)
        .executeTakeFirst()

    if (!invite) return <ErrorAlert error="Invalid invitation" />

    return (
        <Container>
            <Panel title="Welcome To SafeInsights">
                <AccountPanel inviteId={inviteId} email={invite.email} />
            </Panel>
        </Container>
    )
}
