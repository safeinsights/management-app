import type { Story } from '@ladle/react'
import { Table } from '@mantine/core'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { TableHeader } from './columns'

const meta = { title: 'Tables / Studies table header', argTypes: pageBackgroundArgTypes }
export default meta

// Inside a real <Table> so the markup is valid.
export const ResearcherColumns: Story = () => (
    <div style={{ padding: 24 }}>
        <Table>
            <TableHeader audience="researcher" scope="user" />
            <Table.Tbody />
        </Table>
    </div>
)

export const ReviewerOrgColumns: Story = () => (
    <div style={{ padding: 24 }}>
        <Table>
            <TableHeader audience="reviewer" scope="org" />
            <Table.Tbody />
        </Table>
    </div>
)

export const ReviewerUserColumns: Story = () => (
    <div style={{ padding: 24 }}>
        <Table>
            <TableHeader audience="reviewer" scope="user" />
            <Table.Tbody />
        </Table>
    </div>
)
