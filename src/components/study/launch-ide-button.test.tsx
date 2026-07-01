import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'
import { LaunchIdeButton } from './launch-ide-button'

describe('LaunchIdeButton', () => {
    const baseProps = {
        onClick: vi.fn(),
        isLaunching: false,
        launchError: null,
    }

    const launchingStatus = (overrides: Partial<WorkspaceLaunchStatus> = {}): WorkspaceLaunchStatus => ({
        buildStatus: 'running',
        buildLogLines: ['pulling base image'],
        agentStatus: null,
        agentLogLines: [],
        ready: false,
        failed: false,
        reason: 'building',
        cursors: { build: null, agent: null },
        url: null,
        ...overrides,
    })

    it('renders the idle outline variant with "Edit files in IDE"', async () => {
        renderWithProviders(<LaunchIdeButton {...baseProps} variant="outline" />)
        expect(screen.getByRole('button', { name: /edit files in ide/i })).toBeInTheDocument()
    })

    it('renders the idle cta variant with "Launch IDE"', async () => {
        renderWithProviders(<LaunchIdeButton {...baseProps} variant="cta" />)
        expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
    })

    it('calls onClick when clicked in idle state', async () => {
        const user = userEvent.setup()
        const onClick = vi.fn()
        renderWithProviders(<LaunchIdeButton {...baseProps} onClick={onClick} variant="outline" />)
        await user.click(screen.getByRole('button', { name: /edit files in ide/i }))
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('shows the launching state with an animated message', async () => {
        renderWithProviders(<LaunchIdeButton {...baseProps} isLaunching={true} variant="outline" />)
        expect(screen.getByText(/launching ide/i)).toBeInTheDocument()
    })

    it('shows the build status while launching', async () => {
        renderWithProviders(
            <LaunchIdeButton {...baseProps} isLaunching={true} status={launchingStatus()} variant="outline" />,
        )
        expect(screen.getByText(/Build: running/)).toBeInTheDocument()
    })

    it('shows the agent status after the build status while launching', async () => {
        const status = launchingStatus({
            agentStatus: { lifecycle: 'starting', status: 'connecting', codeServer: 'initializing' },
        })
        renderWithProviders(<LaunchIdeButton {...baseProps} isLaunching={true} status={status} variant="outline" />)
        expect(
            screen.getByText(/Build: running[\s\S]*lifecycle=starting status=connecting code-server=initializing/),
        ).toBeInTheDocument()
    })

    it('shows the error state with a retry affordance', async () => {
        const user = userEvent.setup()
        const onClick = vi.fn()
        renderWithProviders(
            <LaunchIdeButton {...baseProps} launchError={new Error('boom')} onClick={onClick} variant="outline" />,
        )
        expect(screen.getByText(/launch failed/i)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: /launch failed/i }))
        expect(onClick).toHaveBeenCalledTimes(1)
    })
})
