'use client'

import { Collapse, Box } from '@mantine/core'
import { ReactNode, CSSProperties } from 'react'

interface CollapseContainerProps {
    opened: boolean
    children: ReactNode
    position?: 'top' | 'bottom'
    offset?: string
    backgroundColor?: string
    style?: CSSProperties
}

export const CollapseContainer: React.FC<CollapseContainerProps> = ({
    opened,
    children,
    position = 'bottom',
    offset = '55px',
    backgroundColor = 'var(--mantine-color-purple-9)',
    style,
}) => {
    return (
        <Box
            style={{
                position: 'absolute',
                [position]: offset,
                left: 0,
                width: '100%',
                backgroundColor,
                ...style,
            }}
        >
            <Collapse in={opened}>{children}</Collapse>
        </Box>
    )
}
