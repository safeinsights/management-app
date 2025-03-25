'use client'

import { useState } from 'react'
import { useSignIn } from '@clerk/nextjs'
import { Loader } from '@mantine/core'
import { type MFAState } from './logic'
import { SigninComplete } from './complete'
import { RequestMFA } from './mfa'
import { SignInForm } from './signin'
import { onUserSignInAction } from '@/server/actions/user.actions'

export function SignIn() {
    const { isLoaded } = useSignIn()
    const [state, setState] = useState<MFAState>(false)

    if (!isLoaded) {
        return <Loader />
    }

    const setPending = (pending: MFAState) => {
        if (pending === false) {
            onUserSignInAction().then(() => setState(pending))
        } else {
            setState(pending)
        }
    }

    return (
        <>
            <SigninComplete />
            <SignInForm onComplete={setPending} mfa={state} />
            <RequestMFA onReset={() => setState(false)} mfa={state} />
        </>
    )
}
