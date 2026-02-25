import { Code, ScrollArea } from '@mantine/core'
import type { FC } from 'react'

export const TextViewer: FC<{ text: string }> = ({ text }) => (
    <ScrollArea h={500}>
        <Code block>{text}</Code>
    </ScrollArea>
)
