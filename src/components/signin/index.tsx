'use client'

import { useState } from 'react'
import { useSignIn } from '@clerk/nextjs'
import { Loader } from '@mantine/core'
import { type MFAState } from './logic'
import { SigninComplete } from './complete'
import { RequestMFA } from './mfa'
import { SignInForm } from './signin'

export function SignIn() {
    const { isLoaded } = useSignIn()
    const [state, setState] = useState<MFAState>(false)

    if (!isLoaded) {
        return <Loader />
    }

    const s: React.Dispatch<React.SetStateAction<MFAState>> = setState

    return (
        <>
            <SigninComplete />
            <SignInForm onComplete={s} mfa={state} />
            <RequestMFA onReset={() => setState(false)} mfa={state} />
        </>
    )
}
