import { OrgsAdminTable } from './table'
// eslint-disable-next-line no-restricted-imports
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { fetchAdminOrgsWithStatsAction } from '@/server/actions/org.actions'
import { ClaudeContext } from './claude-context'
import { getClaudeContextAction } from '@/server/actions/claude-context.actions'

export default async function OrgsAdministration() {
    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: ['orgs'],
        queryFn: fetchAdminOrgsWithStatsAction,
    })

    await queryClient.prefetchQuery({
        queryKey: ['claudeContext', 'system', 'null'],
        queryFn: () => getClaudeContextAction({name: 'system', orgId: null})
    })

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <OrgsAdminTable />
            <br />
            <ClaudeContext />
        </HydrationBoundary>
    )
}
