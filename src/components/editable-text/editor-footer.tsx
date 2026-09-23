import { FC, ReactNode } from 'react'
import { Box, Group } from '@mantine/core'

export const EditorFooter: FC<{ left?: ReactNode; right?: ReactNode; children?: ReactNode }> = ({
    left,
    right,
    children,
}) => (
    // gap 0: the empty error slot would otherwise indent the save status away from the input's edge.
    // flex-start, not center: the error box is taller than the counter beside it, so centering
    // nudged the counter down by ~2px whenever the error appeared (OTTER-777). Matches the
    // alignment FieldFooterRow already uses for the same pairing.
    <Group gap={0} align="flex-start" wrap="nowrap">
        {left}
        {children}
        {right && <Box ml="auto">{right}</Box>}
    </Group>
)

// The counter and the error describe the value, which outlives the editor surface, so they render
// on their own while the editor is a skeleton or an unavailable alert (OTTER-777).
export const EditorFooterArea: FC<{ left?: ReactNode; right?: ReactNode }> = ({ left, right }) => {
    if (!left && !right) return null

    return <EditorFooter left={left} right={right} />
}
