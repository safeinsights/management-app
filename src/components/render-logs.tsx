import { FC } from 'react'
import { ScrollArea } from '@mantine/core'

export const RenderLogs: FC<{ logs: string }> = ({ logs }) => {
    return (
        <ScrollArea h={500} type="auto">
            {logs}
        </ScrollArea>
    )
}
