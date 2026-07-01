import { useEffect, type ReactNode } from 'react'
import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { type TimedStep } from '@/hooks/use-timed-progress'
import { useSpyMode } from './spy-mode-context'
import { TimedProgressBar } from './timed-progress-bar'

// `data` is the count of steps that have started.
const steps: TimedStep<number>[] = [
    { estimateSeconds: 10, hasStarted: (n) => n >= 1 },
    { estimateSeconds: 30, hasStarted: (n) => n >= 2 },
]

// Turns spy/debug mode on for its subtree (the toggle is otherwise driven by a UI button).
function SpyMode({ children }: { children: ReactNode }) {
    const { isSpyMode, toggleSpyMode } = useSpyMode()
    useEffect(() => {
        if (!isSpyMode) toggleSpyMode()
    }, [isSpyMode, toggleSpyMode])
    return <>{children}</>
}

describe('TimedProgressBar', () => {
    it('renders nothing when not visible', () => {
        renderWithProviders(<TimedProgressBar isVisible={false} steps={steps} data={0} lastUpdatedAt={new Date()} />)
        expect(screen.queryByText(/Ready|Updated/)).not.toBeInTheDocument()
    })

    it('shows the estimated completion time and the last-updated time as <time> tags', () => {
        const at = new Date()
        const { container } = renderWithProviders(
            <TimedProgressBar isVisible={true} steps={steps} data={0} lastUpdatedAt={at} />,
        )
        expect(container.textContent).toContain('Ready')
        expect(container.textContent).toContain('· updated')
        const updatedEl = screen.getByText('just now')
        expect(updatedEl.tagName).toBe('TIME')
        expect(updatedEl).toHaveAttribute('title', at.toISOString())
        expect(container.querySelectorAll('time')).toHaveLength(2)
    })

    it('does not reveal children outside spy mode', () => {
        const { container } = renderWithProviders(
            <TimedProgressBar isVisible={true} steps={steps} data={0} lastUpdatedAt={new Date()}>
                <div>expandable detail</div>
            </TimedProgressBar>,
        )
        expect(container.querySelector('details')).toBeNull()
        expect(container.textContent).not.toContain('expandable detail')
    })

    it('in spy mode, the caption becomes a collapsed <details> summary revealing its children', () => {
        const at = new Date()
        const { container } = renderWithProviders(
            <SpyMode>
                <TimedProgressBar isVisible={true} steps={steps} data={0} lastUpdatedAt={at}>
                    <div>expandable detail</div>
                </TimedProgressBar>
            </SpyMode>,
        )
        const details = container.querySelector('details')
        expect(details?.open).toBe(false)
        expect(container.querySelector('summary')?.textContent).toContain('Ready')
        expect(container.textContent).toContain('expandable detail')
    })

    it('drops the completion estimate once it has lapsed', () => {
        const staleUpdate = new Date(Date.now() - 60 * 60 * 1000)
        const { container } = renderWithProviders(
            <TimedProgressBar isVisible={true} steps={steps} data={0} lastUpdatedAt={staleUpdate} />,
        )
        expect(container.textContent).not.toContain('Ready')
        expect(container.textContent).toContain('Updated')
        expect(container.querySelectorAll('time')).toHaveLength(1)
    })
})
