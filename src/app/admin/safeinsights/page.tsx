import { OrgsAdminTable } from './table'
// eslint-disable-next-line no-restricted-imports
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { fetchOrgsWithStatsAction } from '@/server/actions/org.actions'

export const dynamic = 'force-dynamic'

export default async function OrgsAdministration() {
    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: ['orgs'],
        queryFn: fetchOrgsWithStatsAction,
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <OrgsAdminTable />
        </HydrationBoundary>
    )
}
