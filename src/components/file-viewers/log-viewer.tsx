import { parseLogMessages } from '@/lib/file-content-helpers'
import { Code, ScrollArea, Table } from '@mantine/core'
import type { ReactNode } from 'react'

function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString()
}

export function logViewer(_path: string, text: string): ReactNode | null {
    const entries = parseLogMessages(text)
    if (!entries) return null

    return (
        <ScrollArea h={500}>
            <Table withRowBorders={false} verticalSpacing="xxs">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th w={100}>Time</Table.Th>
                        <Table.Th>Message</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {entries.map((entry, i) => (
                        <Table.Tr key={i}>
                            <Table.Td w={100} valign="top" className="nowrap">
                                <Code>{formatTimestamp(entry.timestamp)}</Code>
                            </Table.Td>
                            <Table.Td className="pre-wrap">{entry.message}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </ScrollArea>
    )
}
