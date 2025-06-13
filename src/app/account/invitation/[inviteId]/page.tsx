import { db } from '@/database'
import { Container, Title, Flex } from '@mantine/core'
import { redirect } from 'next/navigation'
import { AccountPanel } from './account-form'

export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
    const { inviteId } = await params

    const invite = await db
        .selectFrom(['pendingUser', 'org'])
        .select(['pendingUser.email', 'org.name as orgName'])
        .whereRef('org.id', '=', 'pendingUser.orgId')
        .where('pendingUser.claimedByUserId', 'is', null)
        .where('pendingUser.id', '=', inviteId)
        .executeTakeFirst()

    if (!invite) {
        redirect('/')
    }

    return (
        <Flex h="90vh" align="center" justify="center">
            <Container bg="white" p="xxl">
                <Title mb="md" ta="center" order={3}>
                    Welcome to SafeInsights!
                </Title>
                <AccountPanel inviteId={inviteId} email={invite.email} orgName={invite.orgName} />
            </Container>
        </Flex>
    )
}
