import { semanticColor } from '@/theme/tokens'
import { Box } from '@mantine/core'
import { CaretUpDownIcon, CaretUpIcon } from '@phosphor-icons/react/dist/ssr'
import type { FC, ReactNode } from 'react'

// Overrides the library's grey.
const SortIcon: FC<{ children: ReactNode }> = ({ children }) => (
    <Box component="span" display="flex" c={semanticColor('text.primary')}>
        {children}
    </Box>
)

// For every sortable DataTable's `sortIcons`. The library flips `sorted` for a descending sort.
export const SORT_ICONS = {
    unsorted: (
        <SortIcon>
            <CaretUpDownIcon size={12} />
        </SortIcon>
    ),
    sorted: (
        <SortIcon>
            <CaretUpIcon size={12} />
        </SortIcon>
    ),
}
