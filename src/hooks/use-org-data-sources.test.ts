import {
    createTestQueryClient,
    createTestQueryWrapper,
    describe,
    expect,
    insertTestDataSource,
    it,
    mockSessionWithTestData,
    renderHook,
    waitFor,
} from '@/tests/unit.helpers'
import { orgDataSourcesQueryKey, useOrgDataSources } from './use-org-data-sources'

describe('useOrgDataSources', () => {
    it('refetches when the settings pages invalidate the data source list', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        await insertTestDataSource({ orgId: org.id, name: 'First' })
        const queryClient = createTestQueryClient()

        const { result } = renderHook(() => useOrgDataSources(org.slug), {
            wrapper: createTestQueryWrapper({ queryClient }),
        })
        await waitFor(() => expect(result.current.options.map((o) => o.label)).toEqual(['First']))

        await insertTestDataSource({ orgId: org.id, name: 'Second' })
        await queryClient.invalidateQueries({ queryKey: orgDataSourcesQueryKey(org.slug) })

        await waitFor(() => expect(result.current.options.map((o) => o.label)).toContain('Second'))
    })
})
