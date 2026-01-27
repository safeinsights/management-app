'use client'

import { useSignIn } from '@clerk/nextjs'
import { Container, Loader } from '@mantine/core'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Routes } from '@/lib/routes'
import { type MFAState } from './logic'
import { RequestMFA } from './mfa'
import { SignInForm } from './sign-in-form'

type SignInStep = 'form' | 'mfa'

export default function SigninPage() {
    const { isLoaded } = useSignIn()
    const searchParams = useSearchParams()
    const router = useRouter()

    const [step, setStep] = useState<SignInStep>('form')
    const [mfaState, setMFAState] = useState<MFAState>(false)

    // Reset the sign-in flow when ?restart param is present
    useEffect(() => {
        const restart = searchParams.get('restart')
        if (restart) {
            // TODO: investigate if this is an issue, disable was added during upgrading eslint which pointed out possible errors
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMFAState(false)
            setStep('form')
            // Remove the param from the URL to avoid loops
            router.replace(Routes.accountSignin)
        }
    }, [searchParams, router])

    if (!isLoaded) {
        return <Loader />
    }

    const setPending = async (pending: MFAState) => {
        if (pending === false) {
            setMFAState(false)
            setStep('form')
            return
        }

        setMFAState(pending)
        setStep('mfa')
    }

    return (
        <Container w={500}>
            {step === 'form' && <SignInForm onComplete={setPending} mfa={false} />}
            {step === 'mfa' && <RequestMFA mfa={mfaState} />}
        </Container>
    )
}
