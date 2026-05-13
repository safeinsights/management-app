import { OrgsAdminTable } from './table'
// eslint-disable-next-line no-restricted-imports
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { fetchAdminOrgsWithStatsAction } from '@/server/actions/org.actions'
import { ClaudeContext } from './claude-context'
import { getClaudeContextAction } from '@/server/actions/claude-context.actions'
import { CONTEXT_NAMES } from '@/lib/claude-context'
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
                queryKey: ['claudeContext', name, null],
                queryFn: () => getClaudeContextAction({name: name, orgId: null}),
                retry: false
            })
        })
    )

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <Stack gap="xl">
                <OrgsAdminTable />
                <ClaudeContext />
            </Stack>
        </HydrationBoundary>
    )
}
