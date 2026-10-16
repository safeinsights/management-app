import { describe, expect, fireEvent, it, renderWithProviders, screen, vi } from '@/tests/unit.helpers'
import { getColumns } from './columns'
import { DEFAULT_SORT } from './sort'
import { StudiesTableView } from './studies-table-view'

// jsdom has no layout, so each scroll positions the header itself.
const scrollWithHeaderAt = (table: HTMLTableElement, headerTop: number) => {
    vi.spyOn(table, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600))
    vi.spyOn(table.tHead!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, headerTop, 800, 48))
    fireEvent.scroll(window)
}

describe('StudiesTableView pinned header', () => {
    it('marks the table pinned while its header sits below the table top, and clears it back at rest', () => {
        renderWithProviders(
            <StudiesTableView
                rows={[]}
                columns={getColumns('reviewer', 'org', false)}
                sort={DEFAULT_SORT}
                onSort={() => undefined}
                audience="reviewer"
            />,
        )
        const table = screen.getByRole<HTMLTableElement>('table')
        expect(table).not.toHaveAttribute('data-pinned')

        scrollWithHeaderAt(table, 120)
        expect(table).toHaveAttribute('data-pinned')

        scrollWithHeaderAt(table, 0)
        expect(table).not.toHaveAttribute('data-pinned')
    })
})
