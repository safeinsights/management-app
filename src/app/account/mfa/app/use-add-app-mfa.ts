'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import { useReverification } from '@clerk/nextjs'
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
    const createBackupCode = useReverification(() => user?.createBackupCode())
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
        setIsVerifying(true)
        try {
            await user?.verifyTOTP({ code: values.code })
            if (user && !user.backupCodeEnabled) {
                try {
                    const resource = await createBackupCode()
                    setBackupCodes(resource?.codes || [])
                } catch (err) {
                    logger.error({ err, message: 'Error generating backup codes' })
                    setBackupCodes([])
                }
            }
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
