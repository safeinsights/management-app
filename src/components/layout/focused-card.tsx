import { Paper, type PaperProps } from '@mantine/core'
import { type ReactNode } from 'react'
import { semanticColor } from '@/theme/tokens'

// A max width, not a fixed one, so the card shrinks to fit a phone instead of scrolling the page sideways.
export const FocusedCard = ({ children, ...paperProps }: PaperProps & { children: ReactNode }) => (
    <Paper
        bg={semanticColor('surface.raised')}
        p={{ base: 'lg', xs: 'xxl' }}
        radius="sm"
        w="100%"
        maw={600}
        {...paperProps}
    >
        {children}
    </Paper>
)
