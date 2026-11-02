import {
    describe,
    expect,
    hydrateServerHtml,
    it,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { CodeRunHistory } from './code-run-history'

const run = (id: string, ranAt: string) => ({ id, ranAt: new Date(ranAt) })

const RUNS = [
    run('run-3', '2026-03-05T12:00:00Z'),
    run('run-2', '2026-02-10T12:00:00Z'),
    run('run-1', '2026-01-20T12:00:00Z'),
]

const viewButton = () => screen.getByRole('button', { name: /^(View|Hide)$/ })

const firstRow = () => screen.getAllByTestId('code-run-history-row')[0]

describe('CodeRunHistory', () => {
    it('renders nothing when there are no earlier runs', () => {
        renderWithProviders(<CodeRunHistory runs={[]} />)

        expect(screen.queryByTestId('code-run-history')).toBeNull()
    })

    it.each([1, 2, 3, 4])('counts %i earlier runs in the title', (count) => {
        const runs = Array.from({ length: count }, (_, i) => run(`run-${i}`, `2026-01-0${i + 1}T12:00:00Z`))
        renderWithProviders(<CodeRunHistory runs={runs} />)

        expect(screen.getByRole('heading', { name: `Code run history (${count})` })).toBeInTheDocument()
    })

    it('starts collapsed with a View button', () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)

        expect(viewButton()).toHaveTextContent('View')
        expect(viewButton()).toHaveAttribute('aria-expanded', 'false')
        expect(firstRow()).not.toBeVisible()
    })

    it('expands in place to list every earlier run, and Hide collapses it again', async () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)

        await userEvent.click(viewButton())

        expect(viewButton()).toHaveTextContent('Hide')
        expect(viewButton()).toHaveAttribute('aria-expanded', 'true')
        expect(viewButton()).toHaveAttribute('type', 'button')
        await waitFor(() => expect(firstRow()).toBeVisible())
        expect(screen.getAllByTestId('code-run-history-row').map((row) => row.textContent)).toEqual([
            'Code run • Mar 05, 2026',
            'Code run • Feb 10, 2026',
            'Code run • Jan 20, 2026',
        ])

        await userEvent.click(viewButton())

        expect(viewButton()).toHaveTextContent('View')
        await waitFor(() => expect(firstRow()).not.toBeVisible())
    })

    it('stays stable across repeated expand and collapse cycles', async () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)

        for (let i = 0; i < 3; i++) {
            await userEvent.click(viewButton())
            expect(viewButton()).toHaveTextContent('Hide')
            await userEvent.click(viewButton())
            expect(viewButton()).toHaveTextContent('View')
        }
        expect(screen.getAllByTestId('code-run-history-row')).toHaveLength(3)
    })

    // Tests run in America/Chicago, where a run ending after UTC midnight is still the day before.
    it('hydrates without a mismatch when a run ended after UTC midnight', async () => {
        const { recoverableErrors } = hydrateServerHtml(<CodeRunHistory runs={[run('late', '2026-09-24T01:30:00Z')]} />)

        await waitFor(() => expect(firstRow()).toHaveTextContent('Code run • Sep 23, 2026'))
        expect(recoverableErrors).toEqual([])
    })
})
