import { Link } from '@/components/links'
import { db } from '@/database'
import { sessionFromClerk } from '@/server/clerk'
import { Button, Flex, Paper, Text, Title } from '@mantine/core'
import { redirect, RedirectType } from 'next/navigation'
import { FC } from 'react'
import { SignOutPanel } from './signout-panel'

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
        .leftJoin('user as invitingUser', 'invitingUser.id', 'pendingUser.invitedByUserId')
        .select([
            'user.id as matchingUser',
            'org.name as orgName',
            'pendingUser.isAdmin',
            'invitingUser.firstName as firstName',
            'invitingUser.lastName as lastName',
        ])
        .whereRef('org.id', '=', 'pendingUser.orgId')
        .where('pendingUser.claimedByUserId', 'is', null)
        .where('pendingUser.id', '=', inviteId)
        .executeTakeFirst()

    const invitingUserName =
        pendingInvite?.firstName && pendingInvite?.lastName
            ? `${pendingInvite.firstName} ${pendingInvite.lastName}`
            : undefined

    const claimedInvite = await db
        .selectFrom('pendingUser')
        .where('claimedByUserId', 'is not', null)
        .where('id', '=', inviteId)
        .executeTakeFirst()

    if (claimedInvite || !pendingInvite) {
        // redirect to the signin page with a flag, shows error message
        redirect(`/account/signin?invite_not_found=1`, RedirectType.replace)
    }

    if (pendingInvite?.matchingUser) {
        // redirect to the join team page after signing in
        redirect(`/account/signin?redirect_url=/account/invitation/${inviteId}/join-team`, RedirectType.replace)
    } else {
        return (
            <InviteAccountPanel
                orgName={pendingInvite?.orgName}
                isAdmin={pendingInvite?.isAdmin}
                invitingUserName={invitingUserName}
                inviteId={inviteId}
            />
        )
    }
}

const InviteAccountPanel: FC<{
    orgName?: string
    isAdmin?: boolean
    invitingUserName?: string
    inviteId: string
}> = ({ orgName, isAdmin, invitingUserName, inviteId }) => {
    return (
        <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
            <Flex direction="column" maw={500} mx="auto" pb="xxl" gap="md">
                <Title order={3} ta="center">
                    You’ve been invited to join SafeInsights!
                </Title>
                <Text size="md" my="xs">
                    {invitingUserName} has invited you to join {orgName} as a {isAdmin ? 'admin' : 'contributor'}. Since
                    we couldn&apos;t find an existing account associated with this email, please select one of the
                    options below:
                </Text>
                <Text size="md" fw={600} ta="center">
                    Already have a SafeInsights account?
                </Text>
                <Button
                    variant="filled"
                    size="lg"
                    component={Link}
                    href={`/account/signin?invite_id=${inviteId}`}
                    w="100%"
                >
                    Login with existing account
                </Button>
                <Text size="sm" c="red.8">
                    <b>Note:</b> Strongly recommended if you already have an account, since merging accounts later is
                    not supported.
                </Text>
                <Text size="md" ta="center" w="100%" my="xs">
                    OR
                </Text>
                <Text size="md" fw={600} ta="center">
                    Setting up a new SafeInsights account?
                </Text>
                <Button
                    variant="outline"
                    size="lg"
                    component={Link}
                    href={`/account/invitation/${inviteId}/signup`}
                    w="100%"
                >
                    Create New Account
                </Button>
            </Flex>
        </Paper>
    )
}
