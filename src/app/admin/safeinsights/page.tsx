import { OrgsAdminTable } from './table'
// eslint-disable-next-line no-restricted-imports
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { fetchAdminOrgsWithStatsAction } from '@/server/actions/org.actions'
import { AgentContext } from './agent-context'
import { getAgentContextAction } from '@/server/actions/agent-context.actions'
import { CONTEXT_NAMES } from '@/lib/agent-context'
import { Stack } from '@mantine/core'

export default async function OrgsAdministration() {
    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
        queryKey: ['orgs'],
        queryFn: fetchAdminOrgsWithStatsAction,
    })
    await Promise.all(
        CONTEXT_NAMES.map((name) => {
            return queryClient.prefetchQuery({
                queryKey: ['agentContext', name, null],
                queryFn: () => getAgentContextAction({ name: name, orgId: null }),
                retry: false,
            })
        }),
    )

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <Stack gap="xl">
                <OrgsAdminTable />
                <AgentContext />
            </Stack>
        </HydrationBoundary>
    )
}
