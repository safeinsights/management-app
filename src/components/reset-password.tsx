'use client'

import { useState } from 'react'
import { Loader } from '@mantine/core'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { PendingReset } from './reset-password/pending-reset'
import { ResetForm } from './reset-password/reset-form'

export function ResetPassword() {
    const { isLoaded, signIn } = useSignIn()
    const [pendingReset, setPendingReset] = useState<SignInResource | null>(null)

    if (!isLoaded) {
        return <Loader />
    }

    if (pendingReset) {
        return <PendingReset pendingReset={pendingReset} onBack={() => setPendingReset(null)} />
    }

    return <ResetForm onComplete={(reset) => setPendingReset(reset)} />
}
