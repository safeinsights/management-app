'use client'

import { useState } from 'react'
import { Loader } from '@mantine/core'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { PendingReset } from './pending-reset'
import { ResetForm } from './reset-form'
import { VerificationModal } from './verification-modal'
import { onUserResetPWAction } from '@/server/actions/user.actions'

export function ResetPassword() {
    const { isLoaded } = useSignIn()
    const [pendingReset, setPendingReset] = useState<SignInResource | null>(null)
    const [showVerification, setShowVerification] = useState(false)

    if (!isLoaded) {
        return <Loader />
    }

    const onComplete = (info: SignInResource) => {
        setPendingReset(info)
        setShowVerification(true)
    }

    const onVerificationComplete = () => {
        setShowVerification(false)
        onUserResetPWAction()
    }

    if (pendingReset && showVerification) {
        return (
            <VerificationModal
                onCompleteAction={onVerificationComplete}
                onBack={() => {
                    setPendingReset(null)
                    setShowVerification(false)
                }}
            />
        )
    }

    if (pendingReset) {
        return <PendingReset pendingReset={pendingReset} />
    }

    return <ResetForm onCompleteAction={onComplete} />
}
