import { Table } from '@mantine/core'
import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import type { JobFileActivity } from '@/server/db/queries'
import { OutputsFileRow, formatActivityDate, truncateFileName, type OutputFileRowData } from './outputs-file-row'

const buildRow = (overrides: Partial<OutputFileRowData> = {}): OutputFileRowData => ({
    key: 'row-1',
    studyJobFileId: 'archive-1',
    filePath: 'run.log',
    name: 'run.log',
    contents: new ArrayBuffer(4),
    activity: null,
    ...overrides,
})

const buildActivity = (overrides: Partial<JobFileActivity> = {}): JobFileActivity => ({
    studyJobFileId: 'archive-1',
    filePath: 'run.log',
    action: 'VIEWED',
    createdAt: new Date('2026-04-22T12:38:00Z'),
    actorName: 'Jessica Walters',
    ...overrides,
})

const renderRow = (row: OutputFileRowData) => {
    const onView = vi.fn()
    const onDownload = vi.fn()
    renderWithProviders(
        <Table>
            <Table.Tbody>
                <OutputsFileRow row={row} onView={onView} onDownload={onDownload} />
            </Table.Tbody>
        </Table>,
    )
    return { onView, onDownload }
}

const NAME_51 = 'a'.repeat(51)
const NAME_50 = 'a'.repeat(50)

describe('truncateFileName', () => {
    it('leaves names at or under 50 characters untouched', () => {
        expect(truncateFileName('run.log')).toBe('run.log')
        expect(truncateFileName(NAME_50)).toBe(NAME_50)
    })

    it('truncates at exactly 50 characters with an ellipsis', () => {
        expect(truncateFileName(NAME_51)).toBe(`${'a'.repeat(50)}…`)
    })
})

describe('OutputsFileRow file name', () => {
    it('renders the name as a real button, reachable by Tab and activatable by keyboard', async () => {
        const { onView } = renderRow(buildRow())

        const button = screen.getByRole('button', { name: 'run.log' })
        await userEvent.tab()
        expect(button).toHaveFocus()

        await userEvent.keyboard('{Enter}')
        expect(onView).toHaveBeenCalledTimes(1)
    })

    it('calls onView when clicked', async () => {
        const { onView } = renderRow(buildRow())

        await userEvent.click(screen.getByRole('button', { name: 'run.log' }))

        expect(onView).toHaveBeenCalledWith(expect.objectContaining({ name: 'run.log' }))
    })

    // The visual tooltip is not exposed to every AT, so a truncated name also carries the full
    // value as its accessible name.
    it('exposes the untruncated name to assistive tech when truncated', () => {
        renderRow(buildRow({ name: NAME_51 }))

        expect(screen.getByRole('button', { name: NAME_51 })).toBeInTheDocument()
        expect(screen.getByText(`${'a'.repeat(50)}…`)).toBeInTheDocument()
    })

    it('shows the full name in a tooltip on hover', async () => {
        renderRow(buildRow({ name: NAME_51 }))

        await userEvent.hover(screen.getByTestId('outputs-file-name-row-1'))

        expect(await screen.findByRole('tooltip')).toHaveTextContent(NAME_51)
    })

    // Keyboard users never hover, so a hover-only tooltip would hide the full name from them.
    it('shows the tooltip on keyboard focus too', async () => {
        renderRow(buildRow({ name: NAME_51 }))

        await userEvent.tab()

        expect(await screen.findByRole('tooltip')).toHaveTextContent(NAME_51)
    })
})

describe('OutputsFileRow last activity', () => {
    it('renders real text when nothing has happened yet', () => {
        renderRow(buildRow())
        expect(screen.getByText('No activity yet')).toBeInTheDocument()
    })

    it('renders actor, action and timestamp for a view', () => {
        renderRow(buildRow({ activity: buildActivity() }))

        const cell = screen.getByText(/Jessica Walters/).closest('p')!
        expect(cell).toHaveTextContent('Jessica Walters')
        expect(cell).toHaveTextContent('Viewed')
        expect(cell).toHaveTextContent(formatActivityDate(new Date('2026-04-22T12:38:00Z')))
    })

    it('labels a download action "Downloaded"', () => {
        renderRow(buildRow({ activity: buildActivity({ action: 'DOWNLOADED', actorName: 'David Burns' }) }))

        expect(screen.getByText(/David Burns/).closest('p')).toHaveTextContent('Downloaded')
    })

    it('formats the timestamp as "MMM DD, YYYY, hh:mm a"', () => {
        expect(formatActivityDate(new Date('2026-04-21T13:12:00'))).toBe('Apr 21, 2026, 01:12 pm')
    })

    // Read straight through, "Name · Viewed · Apr 22" announces as one run-on phrase; the dots
    // are hidden and replaced with connective text so the three parts stay distinguishable.
    it('hides the middle dots from assistive tech and supplies spoken separators', () => {
        renderRow(buildRow({ activity: buildActivity() }))

        const cell = screen.getByText(/Jessica Walters/).closest('p')!
        const hiddenDots = cell.querySelectorAll('[aria-hidden="true"]')
        expect(hiddenDots).toHaveLength(2)
        for (const dot of hiddenDots) {
            expect(dot.textContent?.trim()).toBe('·')
        }
        expect(cell.textContent).toContain(' on ')
    })
})

describe('OutputsFileRow actions', () => {
    it('downloads that file when the icon is clicked', async () => {
        const { onDownload } = renderRow(buildRow())

        await userEvent.click(screen.getByRole('button', { name: 'Download run.log' }))

        expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ name: 'run.log' }))
    })

    // Inverse of the header's Download all icon: this icon is the only control in the cell, so
    // hiding it would leave the button with no accessible name at all.
    it('names the icon after the file rather than hiding it', () => {
        renderRow(buildRow({ name: 'results.csv' }))

        const button = screen.getByRole('button', { name: 'Download results.csv' })
        expect(button).not.toHaveAttribute('aria-hidden')
        expect(button.querySelector('svg')).not.toHaveAttribute('aria-hidden', 'true')
    })

    it('shows a Download tooltip on hover', async () => {
        renderRow(buildRow())

        await userEvent.hover(screen.getByTestId('outputs-file-download-row-1'))

        expect(await screen.findByRole('tooltip')).toHaveTextContent('Download')
    })
})
