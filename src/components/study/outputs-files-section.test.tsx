import { describe, expect, it, renderWithProviders, screen, userEvent, vi, within } from '@/tests/unit.helpers'
import { OutputsFilesSection } from './outputs-files-section'
import type { OutputFileRowData } from './outputs-file-row'

const buildRow = (name: string, overrides: Partial<OutputFileRowData> = {}): OutputFileRowData => ({
    key: `file-${name}`,
    studyJobFileId: 'archive-1',
    filePath: name,
    name,
    contents: new ArrayBuffer(4),
    isActivityKnown: true,
    activity: null,
    ...overrides,
})

const renderSection = (rows: OutputFileRowData[], overrides: Record<string, unknown> = {}) => {
    const props = {
        rows,
        isPreparingZip: false,
        onView: vi.fn(),
        onDownload: vi.fn(),
        onDownloadAll: vi.fn(),
        ...overrides,
    }
    renderWithProviders(<OutputsFilesSection {...props} />)
    return props
}

describe('OutputsFilesSection', () => {
    it('renders the section header and the three columns', () => {
        renderSection([buildRow('run.log')])

        expect(screen.getByText('Output files')).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'File name' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Last activity' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()
    })

    // Semantic table markup, not a div grid: screen readers navigate by row/column and announce
    // the header with each cell only when the real roles are present.
    it('uses real table semantics with column-scoped headers', () => {
        renderSection([buildRow('run.log')])

        expect(screen.getByRole('table')).toBeInTheDocument()
        for (const header of screen.getAllByRole('columnheader')) {
            expect(header).toHaveAttribute('scope', 'col')
        }
    })

    it('renders one row per file', () => {
        renderSection([buildRow('run.log'), buildRow('results.csv')])

        const body = screen.getByRole('table').querySelector('tbody')!
        expect(within(body).getAllByRole('row')).toHaveLength(2)
    })

    describe('Download all', () => {
        it('renders once two or more files are present', () => {
            renderSection([buildRow('run.log'), buildRow('results.csv')])
            expect(screen.getByRole('button', { name: 'Download all' })).toBeInTheDocument()
        })

        // Removed from the DOM, not merely hidden: a CSS-hidden control still takes tab focus and
        // leaves a keyboard user on an invisible element.
        it('is absent from the DOM for a single file', () => {
            renderSection([buildRow('run.log')])
            expect(screen.queryByRole('button', { name: 'Download all' })).toBeNull()
            expect(screen.queryByTestId('outputs-download-all')).toBeNull()
        })

        it('is absent from the DOM when there are no files', () => {
            renderSection([])
            expect(screen.queryByTestId('outputs-download-all')).toBeNull()
        })

        it('appears in the tab order only when rendered', async () => {
            const { unmount } = renderWithProviders(
                <OutputsFilesSection
                    rows={[buildRow('run.log')]}
                    isPreparingZip={false}
                    onView={vi.fn()}
                    onDownload={vi.fn()}
                    onDownloadAll={vi.fn()}
                />,
            )
            // One file: tabbing lands on the file name, never on a hidden Download all.
            await userEvent.tab()
            expect(screen.getByTestId('outputs-file-name-file-run.log')).toHaveFocus()
            unmount()

            renderSection([buildRow('a.log'), buildRow('b.log')])
            await userEvent.tab()
            expect(screen.getByTestId('outputs-download-all')).toHaveFocus()
        })

        it('calls onDownloadAll when clicked', async () => {
            const props = renderSection([buildRow('a.log'), buildRow('b.log')])

            await userEvent.click(screen.getByRole('button', { name: 'Download all' }))

            expect(props.onDownloadAll).toHaveBeenCalledTimes(1)
        })

        // Decorative here, unlike the per-row icon: the button already carries a visible text
        // label, so announcing the icon too would double up.
        it('marks its icon decorative', () => {
            renderSection([buildRow('a.log'), buildRow('b.log')])

            const icon = screen.getByTestId('outputs-download-all').querySelector('svg')
            expect(icon).toHaveAttribute('aria-hidden', 'true')
        })
    })
})
