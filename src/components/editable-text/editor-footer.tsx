import { FC, ReactNode } from 'react'
import { Box, Group } from '@mantine/core'

export const EditorFooter: FC<{ left?: ReactNode; right?: ReactNode; children?: ReactNode }> = ({
    left,
    right,
    children,
}) => (
    <Group align="center" wrap="nowrap">
        {left}
        {children}
        {right && <Box ml="auto">{right}</Box>}
    </Group>
)
