import {
    createTestQueryClient,
    describe,
    expect,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { AppShell } from '@mantine/core'
import { AppNav } from './app-nav'

describe('AppNav unread dots', () => {
    // The query client outlives an account switch, so one user's cached dots must not reach the next.
    it("never shows the previous user's cached dots", async () => {
        const { user: previous } = await mockSessionWithTestData({ orgType: 'lab' })
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const queryClient = createTestQueryClient()
        queryClient.setQueryData(['nav-unread', previous.id], {
            myStudies: { researcher: true, reviewer: false },
            orgSlugs: [org.slug],
        })

        renderWithProviders(
            <AppShell navbar={{ width: 240, breakpoint: 'sm' }}>
                <AppNav isOpened onToggle={() => {}} />
            </AppShell>,
            { queryClient },
        )

        expect(screen.queryByText('Updated')).not.toBeInTheDocument()
        await waitFor(() => expect(queryClient.getQueryData(['nav-unread', user.id])).toBeDefined())
        expect(screen.queryByText('Updated')).not.toBeInTheDocument()
    })
})
