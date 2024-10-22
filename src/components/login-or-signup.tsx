'use client'

import { Flex } from '@mantine/core'
import { SignIn } from './signin'

export const LoginOrSignup: React.FC = () => {
    return (
        <Flex justify="center" miw="400px">
            <SignIn />
        </Flex>
    )
}
