import { FC, ReactNode } from 'react'
import { Box, Group } from '@mantine/core'

export const EditorFooter: FC<{ left?: ReactNode; right?: ReactNode; children?: ReactNode }> = ({
    left,
    right,
    children,
}) => (
    // gap 0: the empty error slot would otherwise indent the save status away from the input's edge.
    <Group gap={0} align="center" wrap="nowrap">
        {left}
        {children}
        {right && <Box ml="auto">{right}</Box>}
    </Group>
)
