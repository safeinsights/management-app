'use client'

import { useState, useEffect } from 'react'
import { Flex } from '@mantine/core'
import { SignIn } from './signin'
import { SignUp } from './signup'
import { useRouter } from 'next/navigation'

export const LoginOrSignup: React.FC = () => {
    const [showSignIn, setShowSignIn] = useState(true)
    const router = useRouter()

    useEffect(() => {
        const handlePopState = () => {
            setShowSignIn(true)
        }

        window.addEventListener('popstate', handlePopState)

        return () => {
            window.removeEventListener('popstate', handlePopState)
        }
    }, [])

    const handleSwitchToSignUp = () => {
        setShowSignIn(false)
        window.history.pushState(null, '', '/signup')
    }

    const handleSwitchToSignIn = () => {
        setShowSignIn(true)
        router.back()
    }

    return (
        <Flex justify="center" miw="400px">
            {showSignIn ? (
                <SignIn onSwitchToSignUp={handleSwitchToSignUp} />
            ) : (
                <SignUp onSwitchToSignIn={handleSwitchToSignIn} />
            )}
        </Flex>
    )
}
