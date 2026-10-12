import { Code, ScrollArea } from '@mantine/core'
import type { ReactNode } from 'react'
import classes from './file-viewers.module.css'

export function textViewer(_path: string, text: string): ReactNode {
    return (
        <ScrollArea h={500}>
            <Code block className={classes.wrapped}>
                {text}
            </Code>
        </ScrollArea>
    )
}
