import { MembersAdminTable } from './table'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { fetchMembersAction } from '@/server/actions/member.actions'

export default async function MembersAdministration() {
    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: ['members'],
        queryFn: fetchMembersAction,
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <MembersAdminTable />
        </HydrationBoundary>
    )
}
