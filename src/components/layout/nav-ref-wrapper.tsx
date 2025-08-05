'use client'

import { Box, BoxProps } from '@mantine/core'
import { forwardRef, Ref } from 'react'

//  wrapper that makes content focusable and handles Enter
export const RefWrapper = forwardRef((props: React.PropsWithChildren<BoxProps>, ref: Ref<HTMLDivElement>) => (
    <Box
        {...props}
        ref={ref}
        onClick={(e) => {
            e.stopPropagation()
        }}
    >
        {props.children}
    </Box>
))

RefWrapper.displayName = 'RefWrapper'
