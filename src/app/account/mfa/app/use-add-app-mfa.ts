'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import type { TOTPResource } from '@clerk/nextjs/types'
import { useForm } from '@/common'
import { reportError } from '@/components/errors'
import logger from '@/lib/logger'
import { useRequireUser } from '../use-require-user'

const REGENERATE_COOLDOWN_MS = 30000

export type AddAppMfaStep = 'add' | 'success'

function secretFromUri(uri?: string) {
    if (!uri) return null
    try {
        return new URL(uri).searchParams.get('secret')
    } catch (err) {
        logger.error({ err, message: 'Error parsing TOTP URI' })
        return null
    }
}

export function useAddAppMfa() {
    const { isLoaded, user } = useRequireUser()
    const [step, setStep] = useState<AddAppMfaStep>('add')
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
    const [totp, setTOTP] = useState<TOTPResource | undefined>(undefined)
    const [canRegenerate, setCanRegenerate] = useState(true)
    const [isVerifying, setIsVerifying] = useState(false)
    const userId = user?.id

    const form = useForm({
        initialValues: {
            code: '',
        },
        validate: {
            code: (value: string) => (value.length !== 6 ? 'Code must be 6 digits' : null),
        },
    })

    const createTotp = useEffectEvent(() => {
        void user
            ?.createTOTP()
            .then(setTOTP)
            .catch((err) => reportError(err, 'Error generating MFA'))
    })

    useEffect(() => {
        if (userId) createTotp()
    }, [userId])

    useEffect(() => {
        if (canRegenerate) return
        const timer = setTimeout(() => setCanRegenerate(true), REGENERATE_COOLDOWN_MS)
        return () => clearTimeout(timer)
    }, [canRegenerate])

    const regenerate = async () => {
        try {
            setTOTP(await user?.createTOTP())
            setCanRegenerate(false)
        } catch (err) {
            reportError(err, 'Error regenerating QR code')
        }
    }

    const verifyTotp = async (values: { code: string }) => {
        if (!user) return
        setIsVerifying(true)
        try {
            // Clerk returns first-time codes here; createBackupCode would need a fresh second factor.
            const verified = await user.verifyTOTP({ code: values.code })
            setBackupCodes(verified.backupCodes ?? [])
            setStep('success')
        } catch {
            form.setErrors({ code: 'Invalid verification code. Please try again.' })
        } finally {
            setIsVerifying(false)
        }
    }

    return {
        isReady: isLoaded && Boolean(user),
        step,
        backupCodes,
        totpUri: totp?.uri,
        secret: secretFromUri(totp?.uri),
        canRegenerate,
        isVerifying,
        form,
        regenerate,
        verifyTotp,
    }
}
