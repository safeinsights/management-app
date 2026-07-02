'use client'

import { useSignIn } from '@clerk/nextjs'
import { Container, Loader } from '@mantine/core'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Routes } from '@/lib/routes'
import { AlreadySignedIn } from './already-signed-in'
import { type MFAState } from './logic'
import { RequestMFA } from './mfa'
import { SignInForm } from './sign-in-form'
import { useAlreadySignedIn } from './use-already-signed-in'

type SignInStep = 'form' | 'mfa'

export default function SigninPage() {
    const { isLoaded } = useSignIn()
    const searchParams = useSearchParams()
    const router = useRouter()
    const alreadySignedIn = useAlreadySignedIn()

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

    const isResolvingSession = alreadySignedIn.status === 'loading' || alreadySignedIn.status === 'redirecting'
    if (!isLoaded || isResolvingSession) {
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

    // Show the prompt, not the form, while a session is already active.
    const showForm = alreadySignedIn.status === 'signed-out' && step === 'form'
    const showMFA = alreadySignedIn.status === 'signed-out' && step === 'mfa'

    return (
        <Container w={500}>
            <AlreadySignedIn
                isVisible={alreadySignedIn.status === 'signed-in'}
                email={alreadySignedIn.email}
                isSwitching={alreadySignedIn.isSwitching}
                onContinue={alreadySignedIn.continueToApp}
                onSwitchAccount={alreadySignedIn.switchAccount}
            />
            {showForm && <SignInForm onComplete={setPending} mfa={false} />}
            {showMFA && <RequestMFA mfa={mfaState} />}
        </Container>
    )
}
