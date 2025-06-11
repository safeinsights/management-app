import { Flex } from '@mantine/core'
import { ReactNode } from 'react'

export default function FlexWrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <Flex
            w="100%"
            style={{ overflow: 'clip' }}
            bg="purple.8"
            align="center"
            flex={1}
            ml={-250} // accounts for navbar width
        >
            {children}
        </Flex>
    )
}
