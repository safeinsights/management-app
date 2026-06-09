import type { Story } from '@ladle/react'
import { Table } from '@mantine/core'
import { TableHeader } from './columns'

// TableHeader renders the <thead> of the studies table. The column set varies by
// audience ('researcher' | 'reviewer') and scope ('org' | 'user'), so each story
// shows a distinct column layout. It is purely prop-driven (no data fetching).
const meta = { title: 'Tables / StudiesTableHeader' }
export default meta

// Renders the <thead> inside a real <Table> so the markup is valid. An empty
// <Table.Tbody> keeps the column widths visible without any row fixtures.
export const ResearcherColumns: Story = () => (
    <div style={{ padding: 24 }}>
        <Table>
            <TableHeader audience="researcher" scope="user" />
            <Table.Tbody />
        </Table>
    </div>
)

// Reviewer in org scope: shows "Submitted By" + "Reviewed By".
export const ReviewerOrgColumns: Story = () => (
    <div style={{ padding: 24 }}>
        <Table>
            <TableHeader audience="reviewer" scope="org" />
            <Table.Tbody />
        </Table>
    </div>
)

// Reviewer in user scope: shows "Submitted By" + "Organization".
export const ReviewerUserColumns: Story = () => (
    <div style={{ padding: 24 }}>
        <Table>
            <TableHeader audience="reviewer" scope="user" />
            <Table.Tbody />
        </Table>
    </div>
)
