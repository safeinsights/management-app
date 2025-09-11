'use client'

import { AppModal } from '@/components/modal'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { Button, Group, Loader, Stack, Text } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { FC, useState } from 'react'
import { PendingReset } from './pending-reset'
import { ResetForm } from './reset-form'

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
        router.push('/account/signin')
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
    <AppModal isOpen={isOpen} onClose={onClose} title="Account verification">
        <Stack gap="xxl">
            <Text size="md">
                If this email address is associated with an existing account, you will receive an email verification
                code to reset your password.
            </Text>
            <Group>
                <Button variant="outline" onClick={onClose} size="md">
                    Cancel
                </Button>
                <Button onClick={onConfirm} size="md">
                    Enter verification code
                </Button>
            </Group>
        </Stack>
    </AppModal>
)
