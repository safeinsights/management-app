import { OrgsAdminTable } from './table'
import { dehydrate, HydrationBoundary, QueryClient } from '@/common'
import { fetchAdminOrgsWithStatsAction } from '@/server/actions/org.actions'

export const dynamic = 'force-dynamic'

export default async function OrgsAdministration() {
    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: ['orgs'],
        queryFn: fetchAdminOrgsWithStatsAction,
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <OrgsAdminTable />
        </HydrationBoundary>
    )
}
