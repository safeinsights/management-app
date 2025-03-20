import { Title, Container } from '@mantine/core'
import { pageStyles, mainStyles } from '@/styles/common'
import InviteForm from '@/components/clerkcustom/invite-form'
import { QueryClient, HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { fetchMembersAction } from '@/server/actions/member-actions'

export default async function InvitePage() {
    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: ['members'],
        queryFn: fetchMembersAction,
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className={pageStyles}>
                <main className={mainStyles}>
                    <Container size="sm">
                        <Title mb="lg">Invite New Users</Title>
                        <InviteForm />
                    </Container>
                </main>
            </div>
        </HydrationBoundary>
    )
}
