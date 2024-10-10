'use client'

import { Tabs, Flex } from '@mantine/core'
import { SignIn } from './signin'
import { SignUp } from './signup'

export const LoginOrSignup: React.FC = () => {
    return (
        <Flex justify="center" miw="400px">
            <Tabs defaultValue="login">
                <Tabs.List>
                    <Tabs.Tab value="login">Login</Tabs.Tab>
                    <Tabs.Tab value="signup">Signup</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="login" pt="xs">
                    <SignIn />
                </Tabs.Panel>

                <Tabs.Panel value="signup" pt="xs">
                    <SignUp />
                </Tabs.Panel>
            </Tabs>
        </Flex>
    )
}
