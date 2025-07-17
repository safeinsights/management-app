'use client'

import { useState } from 'react'
import { useSignIn } from '@clerk/nextjs'
import { Container, Loader } from '@mantine/core'
import { type MFAState } from './logic'
import { RequestMFA } from './mfa'
import { SignInForm } from './sign-in-form'
import { onUserSignInAction } from '@/server/actions/user.actions'
import { reportError } from '@/components/errors'

export function SignIn() {
    const { isLoaded } = useSignIn()

    const [state, setState] = useState<MFAState>(false)

    if (!isLoaded) {
        return <Loader />
    }

    const setPending = async (pending: MFAState) => {
        if (pending === false) {
            try {
                await onUserSignInAction()
                setState(pending)
            } catch (error) {
                reportError(error)
            }
        } else {
            setState(pending)
        }
    }

    return (
        <Container w={500}>
            <SignInForm onComplete={setPending} mfa={state} />
            <RequestMFA onReset={() => setState(false)} mfa={state} />
        </Container>
    )
}
