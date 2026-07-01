import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { LAUNCH_STEPS, LaunchProgress, launchProgress } from './launch-progress'

const TOTAL_SECONDS = LAUNCH_STEPS.reduce((sum, step) => sum + step.secondsUntilNext, 0)

// Build the accumulated logs containing the messages of the first `count` milestones.
const logsThrough = (count: number) => ({
    build: LAUNCH_STEPS.slice(0, count)
        .filter((s) => s.log === 'build')
        .map((s) => s.message)
        .join('\n'),
    agent: LAUNCH_STEPS.slice(0, count)
        .filter((s) => s.log === 'agent')
        .map((s) => s.message)
        .join('\n'),
})

describe('launchProgress', () => {
    it('is 0% with the full estimate remaining before any milestone', () => {
        expect(launchProgress('', '')).toEqual({ value: 0, secondsRemaining: TOTAL_SECONDS })
    })

    it('never grows the remaining time or shrinks the bar as milestones are seen', () => {
        let prev = launchProgress('', '')
        for (let count = 1; count <= LAUNCH_STEPS.length; count++) {
            const { build, agent } = logsThrough(count)
            const next = launchProgress(build, agent)
            expect(next.secondsRemaining).toBeLessThanOrEqual(prev.secondsRemaining)
            expect(next.value).toBeGreaterThanOrEqual(prev.value)
            prev = next
        }
    })

    it('leaves only the final step estimate remaining once every milestone is seen', () => {
        const { build, agent } = logsThrough(LAUNCH_STEPS.length)
        const finalStep = LAUNCH_STEPS[LAUNCH_STEPS.length - 1]
        expect(launchProgress(build, agent).secondsRemaining).toBe(finalStep.secondsUntilNext)
    })
})

describe('LaunchProgress', () => {
    it('renders nothing when not visible', () => {
        renderWithProviders(<LaunchProgress isVisible={false} buildLog="" agentLog="" />)
        expect(screen.queryByText(/remaining/)).not.toBeInTheDocument()
    })

    it('shows the estimated ready time and the last-update time as <time> tags', () => {
        const at = new Date()
        const { build, agent } = logsThrough(1)
        const { container } = renderWithProviders(
            <LaunchProgress isVisible={true} buildLog={build} agentLog={agent} lastUpdatedAt={at} />,
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
        expect(readyEl).toHaveAttribute('datetime')
        expect(readyEl.textContent).toMatch(/^(in |just now)/)
    })

    it('drops the estimate and shows only the last update once the estimate has lapsed', () => {
        // last update long enough ago that lastUpdatedAt + secondsRemaining is already in the past
        const staleUpdate = new Date(Date.now() - 60 * 60 * 1000)
        const { build, agent } = logsThrough(1)
        const { container } = renderWithProviders(
            <LaunchProgress isVisible={true} buildLog={build} agentLog={agent} lastUpdatedAt={staleUpdate} />,
        )
        expect(container.textContent).not.toContain('Ready')
        expect(container.textContent).toContain('Updated')
        expect(container.querySelectorAll('time')).toHaveLength(1)
    })
})
