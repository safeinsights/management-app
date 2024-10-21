'use client'

import { useState } from 'react'
import { Flex } from '@mantine/core'
import { SignIn } from './signin'
import { SignUp } from './signup'

export const LoginOrSignup: React.FC = () => {
    const [showSignIn, setShowSignIn] = useState(true)

    return (
        <Flex justify="center" miw="400px">
            {showSignIn ? (
                <SignIn onSwitchToSignUp={() => setShowSignIn(false)} />
            ) : (
                <SignUp onSwitchToSignIn={() => setShowSignIn(true)} />
            )}
        </Flex>
    )
}
