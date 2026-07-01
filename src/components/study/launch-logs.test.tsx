import { describe, expect, it, renderWithProviders } from '@/tests/unit.helpers'
import { LaunchLogs } from './launch-logs'

describe('LaunchLogs', () => {
    it('shows the build and agent logs under their headers in a read-only textarea', () => {
        const { container } = renderWithProviders(
            <LaunchLogs buildLog={'pulling image\ndone'} agentLog="starting code-server" />,
        )
        const logs = container.querySelector('textarea')
        expect(logs).toHaveAttribute('readonly')
        expect(logs?.value).toContain('--------- Build Log\npulling image\ndone')
        expect(logs?.value).toContain('--------- Agent Log\nstarting code-server')
    })
})
