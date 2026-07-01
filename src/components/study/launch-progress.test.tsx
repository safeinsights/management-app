import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { timedProgress } from '@/hooks/use-timed-progress'
import { LAUNCH_STEPS, LaunchProgress } from './launch-progress'

describe('LAUNCH_STEPS', () => {
    it('detects a build milestone and lowers the remaining estimate', () => {
        const before = timedProgress(LAUNCH_STEPS, { buildLog: '', agentLog: '' })
        const after = timedProgress(LAUNCH_STEPS, {
            buildLog: 'aws_ecs_task_definition.workspace[0]: Plan to create',
            agentLog: '',
        })
        expect(before.value).toBe(0)
        expect(after.value).toBeGreaterThan(0)
        expect(after.secondsRemaining).toBeLessThan(before.secondsRemaining)
    })
})

describe('LaunchProgress', () => {
    it('renders nothing when not visible', () => {
        renderWithProviders(<LaunchProgress isVisible={false} buildLog="" agentLog="" />)
        expect(screen.queryByText(/Ready|Updated/)).not.toBeInTheDocument()
    })

    it('shows the estimated ready time and the last-update time as <time> tags', () => {
        const at = new Date()
        const { container } = renderWithProviders(
            <LaunchProgress isVisible={true} buildLog="" agentLog="" lastUpdatedAt={at} />,
        )
        expect(container.textContent).toContain('Ready')
        expect(container.textContent).toContain('· updated')

        const updatedEl = screen.getByText('just now')
        expect(updatedEl.tagName).toBe('TIME')
        expect(updatedEl).toHaveAttribute('title', at.toISOString())
        expect(updatedEl).toHaveAttribute('datetime', at.toISOString())

        // the estimated ready time is a second <time> (a future instant, so phrased "in …")
        const times = [...container.querySelectorAll('time')]
        expect(times).toHaveLength(2)
        const readyEl = times.find((t) => t !== updatedEl)!
        expect(readyEl.textContent).toMatch(/^(in |just now)/)
    })

    it('drops the estimate and shows only the last update once the estimate has lapsed', () => {
        // last update long enough ago that lastUpdatedAt + secondsRemaining is already in the past
        const staleUpdate = new Date(Date.now() - 60 * 60 * 1000)
        const { container } = renderWithProviders(
            <LaunchProgress isVisible={true} buildLog="" agentLog="" lastUpdatedAt={staleUpdate} />,
        )
        expect(container.textContent).not.toContain('Ready')
        expect(container.textContent).toContain('Updated')
        expect(container.querySelectorAll('time')).toHaveLength(1)
    })

    it('hides the logs textarea outside spy mode', () => {
        // renderWithProviders defaults spy mode off, so the collapsible logs detail is not rendered.
        const { container } = renderWithProviders(
            <LaunchProgress isVisible={true} buildLog="pulling base image" agentLog="" lastUpdatedAt={new Date()} />,
        )
        expect(container.querySelector('textarea')).toBeNull()
    })
})
