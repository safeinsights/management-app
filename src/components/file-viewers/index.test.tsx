import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { FileViewer } from './index'

describe('FileViewer', () => {
    // Run logs ship as .json. Dispatching on the extension alone handed them to the code viewer,
    // which highlights but never reformats, so a minified log rendered as one overflowing line.
    it('renders a structured run log as a table rather than raw json', () => {
        const log = JSON.stringify([
            { timestamp: 1785869658968, message: 'Error: unexpected symbol' },
            { timestamp: 1785869658999, message: 'second line' },
        ])

        renderWithProviders(<FileViewer path="logs.json" text={log} />)

        expect(screen.getByRole('table')).toBeInTheDocument()
        expect(screen.getByText('Error: unexpected symbol')).toBeInTheDocument()
        expect(screen.getByText('second line')).toBeInTheDocument()
    })

    it('pretty-prints json that is not a structured log', () => {
        const { container } = renderWithProviders(
            <FileViewer path="results.json" text='{"alpha":1,"nested":{"beta":[1,2]}}' />,
        )

        const code = container.querySelector('code')
        expect(code?.textContent).toContain('\n')
        expect(code?.textContent).toContain('  "alpha": 1')
        // Long values must soft-wrap instead of scrolling off the edge of the modal.
        expect(container.querySelector('pre')).toHaveStyle({ whiteSpace: 'pre-wrap' })
    })

    it('leaves malformed json as-is instead of rendering nothing', () => {
        const { container } = renderWithProviders(<FileViewer path="broken.json" text='{"alpha":' />)

        expect(container.querySelector('code')?.textContent).toContain('{"alpha":')
    })

    it('does not wrap source code, which keeps horizontal scrolling', () => {
        const { container } = renderWithProviders(<FileViewer path="analysis.R" text="x <- 1" />)

        expect(container.querySelector('pre')).not.toHaveStyle({ whiteSpace: 'pre-wrap' })
    })
})
