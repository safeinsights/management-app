import { FC, ReactNode } from 'react'
import { Box, Group } from '@mantine/core'

/**
 * The footer row directly under the editor surface: the footerLeft slot (error message, save
 * indicator), any editor-owned content (the collaborative save status), then footerRight pushed
 * to the row's end. Shared by both editors so the slot layout cannot drift between them.
 */
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
