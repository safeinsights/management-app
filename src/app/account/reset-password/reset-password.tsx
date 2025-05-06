'use client'

import { useState } from 'react'
import { Loader } from '@mantine/core'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { PendingReset } from './pending-reset'
import { ResetForm } from './reset-form'
import { onUserResetPWAction } from '@/server/actions/user.actions'

export function ResetPassword() {
    const { isLoaded } = useSignIn()
    const [pendingReset, setPendingReset] = useState<SignInResource | null>(null)

    if (!isLoaded) {
        return <Loader />
    }

    const onComplete = (info: SignInResource) => {
        setPendingReset(info)
        onUserResetPWAction()
    }

    if (pendingReset) {
        return <PendingReset pendingReset={pendingReset} onBack={() => setPendingReset(null)} />
    }

    return <ResetForm onCompleteAction={onComplete} />
}
