import { TableTh, TableTr, TableThead } from '@mantine/core'
import { Audience, Scope } from './types'

type ColumnDef = {
    id: string
    header: string
}

// Researcher columns (5)
const RESEARCHER_COLUMNS: ColumnDef[] = [
    { id: 'studyName', header: 'Study Name' },
    { id: 'submittedOn', header: 'Submitted On' },
    { id: 'submittedTo', header: 'Submitted To' },
    { id: 'status', header: 'Status' },
    { id: 'details', header: 'Study Details' },
]

// Reviewer org columns (6) - has "Reviewed By" which shows orgSlug
const REVIEWER_ORG_COLUMNS: ColumnDef[] = [
    { id: 'studyName', header: 'Study Name' },
    { id: 'submittedOn', header: 'Submitted On' },
    { id: 'submittedBy', header: 'Submitted By' },
    { id: 'reviewedBy', header: 'Reviewed By' },
    { id: 'status', header: 'Status' },
    { id: 'details', header: 'Details' },
]

// Reviewer user columns (6) - has "Organization" which shows orgName
const REVIEWER_USER_COLUMNS: ColumnDef[] = [
    { id: 'studyName', header: 'Study Name' },
    { id: 'submittedOn', header: 'Submitted On' },
    { id: 'submittedBy', header: 'Submitted By' },
    { id: 'organization', header: 'Organization' },
    { id: 'status', header: 'Status' },
    { id: 'details', header: 'Details' },
]

export function getColumns(audience: Audience, scope: Scope): ColumnDef[] {
    if (audience === 'researcher') {
        return RESEARCHER_COLUMNS
    }
    return scope === 'org' ? REVIEWER_ORG_COLUMNS : REVIEWER_USER_COLUMNS
}

export function TableHeader({ audience, scope }: { audience: Audience; scope: Scope }) {
    const columns = getColumns(audience, scope)

    return (
        <TableThead>
            <TableTr>
                {columns.map((col, index) => (
                    <TableTh key={col.id} fw={600} ta={index === columns.length - 1 ? 'center' : undefined}>
                        {col.header}
                    </TableTh>
                ))}
            </TableTr>
        </TableThead>
    )
}
