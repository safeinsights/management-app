import { Code, ScrollArea } from '@mantine/core'
import type { ReactNode } from 'react'

export function textViewer(_path: string, text: string): ReactNode {
    return (
        <ScrollArea h={500}>
            <Code block style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
                {text}
            </Code>
        </ScrollArea>
    )
}
