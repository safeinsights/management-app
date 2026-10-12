import type { Story } from '@ladle/react'
import { Table } from '@mantine/core'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { getColumns, TableHeader } from './columns'
import { DEFAULT_SORT } from './sort'

const meta = { title: 'Tables / Studies table header', argTypes: pageBackgroundArgTypes }
export default meta

const noop = () => undefined

// Inside a real <Table> so the markup is valid.
export const ResearchLabColumns: Story = () => (
    <div style={{ padding: 24 }}>
        <Table>
            <TableHeader columns={getColumns('researcher', 'org', false)} sort={DEFAULT_SORT} onSort={noop} />
            <Table.Tbody />
        </Table>
    </div>
)

export const DataPartnerColumns: Story = () => (
    <div style={{ padding: 24 }}>
        <Table>
            <TableHeader columns={getColumns('reviewer', 'org', false)} sort={DEFAULT_SORT} onSort={noop} />
            <Table.Tbody />
        </Table>
    </div>
)

export const MyStudiesReviewerWithBelongsTo: Story = () => (
    <div style={{ padding: 24 }}>
        <Table>
            <TableHeader
                columns={getColumns('reviewer', 'user', true)}
                sort={{ column: 'title', direction: 'asc' }}
                onSort={noop}
            />
            <Table.Tbody />
        </Table>
    </div>
)
