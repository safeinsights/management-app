import { Title, Container } from '@mantine/core'
import { pageStyles, mainStyles } from '@/styles/common'
import { InviteForm } from './invite-form'
import { QueryClient, HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { fetchOrgsAction } from '@/server/actions/org.actions'

export const dynamic = 'force-dynamic'

export default async function InvitePage() {
    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: ['orgs'],
        queryFn: fetchOrgsAction,
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
