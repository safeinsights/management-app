import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { LaunchLogs } from './launch-logs'

describe('LaunchLogs', () => {
    it('renders nothing when not visible', () => {
        renderWithProviders(<LaunchLogs isVisible={false} buildLog="building" agentLog="starting" />)
        expect(screen.queryByText('Launching IDE')).not.toBeInTheDocument()
    })

    it('renders a collapsed "Launching IDE" disclosure while launching', () => {
        const { container } = renderWithProviders(<LaunchLogs isVisible={true} buildLog="" agentLog="" />)
        const summary = screen.getByText('Launching IDE')
        expect(summary.tagName).toBe('SUMMARY')
        expect(container.querySelector('details')?.open).toBe(false)
    })

    it('shows the build and agent logs under their headers in a read-only textarea', () => {
        const { container } = renderWithProviders(
            <LaunchLogs isVisible={true} buildLog={'pulling image\ndone'} agentLog="starting code-server" />,
        )
        const logs = container.querySelector('textarea')
        expect(logs).toHaveAttribute('readonly')
        expect(logs?.value).toContain('--------- Build Log\npulling image\ndone')
        expect(logs?.value).toContain('--------- Agent Log\nstarting code-server')
    })

    it('renders lastUpdated in a <time> tag with the ISO timestamp and relative text', () => {
        const at = new Date()
        renderWithProviders(<LaunchLogs isVisible={true} buildLog="building" agentLog="" lastUpdatedAt={at} />)
        const timeEl = screen.getByText('just now')
        expect(timeEl.tagName).toBe('TIME')
        expect(timeEl).toHaveAttribute('datetime', at.toISOString())
        expect(timeEl).toHaveAttribute('title', at.toISOString())
    })
})
