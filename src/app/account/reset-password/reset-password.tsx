'use client'

import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { useSignIn } from '@clerk/nextjs/legacy'
import type { SignInResource } from '@clerk/nextjs/types'
import { Loader } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { FC, useState } from 'react'
import { PendingReset } from './pending-reset'
import { ResetForm } from './reset-form'
import { Routes } from '@/lib/routes'

export function ResetPassword() {
    const { isLoaded } = useSignIn()
    const [pendingReset, setPendingReset] = useState<SignInResource | null>(null)
    const [showVerification, setShowVerification] = useState(false)
    const router = useRouter()

    if (!isLoaded) {
        return <Loader />
    }

    const onComplete = (info: SignInResource) => {
        setPendingReset(info)
        setShowVerification(true)
    }

    const onVerificationComplete = () => {
        setShowVerification(false)
    }

    const onClose = () => {
        setPendingReset(null)
        setShowVerification(false)
        router.push(Routes.accountSignin)
    }

    if (pendingReset && showVerification) {
        return <VerificationModal isOpen={showVerification} onClose={onClose} onConfirm={onVerificationComplete} />
    }

    if (pendingReset) {
        return <PendingReset pendingReset={pendingReset} onResetUpdate={setPendingReset} />
    }

    return <ResetForm onCompleteAction={onComplete} />
}

const VerificationModal: FC<{
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
}> = ({ isOpen, onClose, onConfirm }) => (
    <SubmitConfirmationModal
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={onConfirm}
        isSubmitting={false}
        title="Account verification"
        body="If this email address is associated with an existing account, you will receive an email verification code to reset your password."
        confirmLabel="Enter verification code"
    />
)
