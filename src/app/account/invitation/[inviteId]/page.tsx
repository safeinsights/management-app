import { db } from '@/database'
import { sessionFromClerk } from '@/server/clerk'
import { redirect, RedirectType } from 'next/navigation'
import { SignOutPanel } from './signout-panel'
import { Routes } from '@/lib/routes'
import { clerkClient } from '@clerk/nextjs/server'
import { ButtonLink } from '@/components/links'
import { Flex, Paper, Text, Title } from '@mantine/core'
import type { Route } from 'next'

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
            'pendingUser.email',
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

    // Check if email belongs to any existing Clerk user (handles both primary and merged emails)
    let matchingUser = pendingInvite?.matchingUser
    if (!matchingUser && pendingInvite?.email) {
        const clerk = await clerkClient()
        const clerkUsers = await clerk.users.getUserList({ emailAddress: [pendingInvite.email] })

        if (clerkUsers.data.length > 0) {
            // Check if this Clerk user has a corresponding user in our database
            const userWithClerkId = await db
                .selectFrom('user')
                .select(['id'])
                .where('clerkId', '=', clerkUsers.data[0].id)
                .executeTakeFirst()

            if (userWithClerkId) {
                matchingUser = userWithClerkId.id
            }
        }
    }

    if (matchingUser) {
        // redirect to the join team page after signing in
        const joinTeamUrl = Routes.accountInvitationJoinTeam({ inviteId })
        redirect(`/account/signin?redirect_url=${joinTeamUrl}`, RedirectType.replace)
    }

    const { orgName, isAdmin } = pendingInvite

    return (
        <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
            <Flex direction="column" maw={500} mx="auto" pb="xxl" gap="md">
                <Title order={3} ta="center">
                    You&apos;ve been invited to join SafeInsights!
                </Title>
                <Text size="md" my="xs">
                    {invitingUserName} has invited you to join {orgName} as a {isAdmin ? 'admin' : 'contributor'}. Since
                    we couldn&apos;t find an existing account associated with this email, please select one of the
                    options below:
                </Text>
                <Text size="md" fw={600} ta="center">
                    Already have a SafeInsights account?
                </Text>
                <ButtonLink
                    variant="filled"
                    size="lg"
                    href={`/account/signin?invite_id=${inviteId}` as Route}
                    fullWidth
                >
                    Login with existing account
                </ButtonLink>
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
                <ButtonLink variant="outline" size="lg" href={Routes.accountInvitationSignup({ inviteId })} fullWidth>
                    Create New Account
                </ButtonLink>
            </Flex>
        </Paper>
    )
}
