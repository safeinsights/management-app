import { OrgsAdminTable } from './table'
// eslint-disable-next-line no-restricted-imports
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { fetchAdminOrgsWithStatsAction } from '@/server/actions/org.actions'

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
