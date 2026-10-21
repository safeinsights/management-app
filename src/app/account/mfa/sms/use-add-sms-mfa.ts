'use client'

import { useState } from 'react'
import { useReverification } from '@clerk/nextjs'
import type { PhoneNumberResource } from '@clerk/nextjs/types'
import { isPossiblePhoneNumber } from 'react-phone-number-input'
import { useForm } from '@/common'
import { showToast } from '@/components/toast-notifications'
import { errorToString } from '@/lib/errors'
import logger from '@/lib/logger'
import { sleep } from '@/lib/utils'
import { useRequireUser } from '../use-require-user'
import type { PhoneFormValues } from './add-sms-mfa-view'

const RESEND_THROTTLE_MS = 30000

export type AddSmsMfaStep = 'phone' | 'otp' | 'backup'

// https://clerk.com/docs/custom-flows/add-phone
// https://clerk.com/docs/custom-flows/manage-sms-based-mfa
export function useAddSmsMfa() {
    const { isLoaded, user } = useRequireUser()
    const [isVerifying, setIsVerifying] = useState(false)
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
    const [phoneObj, setPhoneObj] = useState<PhoneNumberResource | undefined>()
    const [isSendingSms, setIsSendingSms] = useState(false)
    const [lastSentTime, setLastSentTime] = useState<number | null>(null)
    const [isVerifyingCode, setIsVerifyingCode] = useState(false)
    const createPhoneNumber = useReverification((phone: string) => user?.createPhoneNumber({ phoneNumber: phone }))
    const setReservedForSecondFactor = useReverification((phone: PhoneNumberResource) =>
        phone.setReservedForSecondFactor({ reserved: true }),
    )
    const makeDefaultSecondFactor = useReverification((phone: PhoneNumberResource) => phone.makeDefaultSecondFactor())
    const createBackupCode = useReverification(() => user?.createBackupCode())

    // OTTER-647. isPossiblePhoneNumber, not isValidPhoneNumber: the latter checks real numbering
    // plans and rejects Clerk's reserved test range the MFA e2e uses.
    const phoneForm = useForm<PhoneFormValues>({
        initialValues: {
            phoneNumber: user?.phoneNumbers[0]?.toString() || '',
        },
        validate: {
            phoneNumber: (value: string) => {
                const phone = value.trim()
                if (!phone) return 'Phone number is required'
                return isPossiblePhoneNumber(phone) ? null : 'Enter a valid phone number'
            },
        },
    })

    const otpForm = useForm({
        initialValues: {
            code: '',
        },
        validate: {
            code: (value: string) => (value.length !== 6 ? 'Code must be 6 digits' : null),
        },
    })

    // Resolves true only when a code actually went out, so callers can confirm it.
    const sendVerificationCode = async (values: PhoneFormValues) => {
        if (!user || isSendingSms) return false

        if (lastSentTime && Date.now() - lastSentTime < RESEND_THROTTLE_MS) {
            showToast({
                category: 'warning',
                title: 'You have recently requested a code. Please wait 30 seconds before trying again.',
            })
            return false
        }

        setLastSentTime(Date.now())
        setIsSendingSms(true)
        try {
            let res = user.phoneNumbers.find((p) => p.phoneNumber === values.phoneNumber)
            if (!res) {
                res = await createPhoneNumber(values.phoneNumber)
            }

            await user.reload()

            const phoneNumber = user.phoneNumbers.find((a) => a.id === res?.id)
            setPhoneObj(phoneNumber)

            await phoneNumber?.prepareVerification()
            await sleep({ 3: 'seconds' })
            setIsSendingSms(false)
            setIsVerifying(true)
            return true
        } catch (error) {
            const errorMessage = errorToString(error)

            if (errorMessage?.includes('`phone_number` must be a `phone_number`')) {
                phoneForm.setFieldError('phoneNumber', 'Please enter a valid phone number.')
            } else {
                phoneForm.setFieldError('phoneNumber', errorMessage)
            }

            setIsSendingSms(false)
            return false
        }
    }

    const resendCode = async () => {
        if (await sendVerificationCode(phoneForm.values)) {
            showToast({ category: 'success', title: 'A new code has been sent!' })
        }
    }

    const verifyCodeAndSetMfa = async (values: typeof otpForm.values) => {
        if (!phoneObj) {
            showToast({ category: 'error', title: 'No phone number found' })
            return
        }

        setIsVerifyingCode(true)

        try {
            const phoneVerifyAttempt = await phoneObj.attemptVerification({ code: values.code })

            if (phoneVerifyAttempt.verification.status !== 'verified') {
                otpForm.setFieldError('code', errorToString(phoneVerifyAttempt))
                return
            }

            try {
                await setReservedForSecondFactor(phoneObj)
                await makeDefaultSecondFactor(phoneObj)
                showToast({ category: 'success', title: 'MFA enabled' })
            } catch (error) {
                console.error(error)
                otpForm.setFieldError('code', 'Failed to enable MFA for this phone number')
                return
            }
            try {
                if (user && !user.backupCodeEnabled) {
                    const resource = await createBackupCode()
                    setBackupCodes(resource?.codes || [])
                }
            } catch (err) {
                logger.error({ err, message: 'Error generating backup codes' })
                setBackupCodes([])
            }

            showToast({ category: 'success', title: 'Verification successful' })
        } catch (err) {
            otpForm.setFieldError(
                'code',
                errorToString(err, {
                    clerkOverrides: { form_code_incorrect: 'Invalid verification code. Please try again.' },
                }),
            )
        } finally {
            setIsVerifyingCode(false)
        }
    }

    const step: AddSmsMfaStep = backupCodes ? 'backup' : isVerifying ? 'otp' : 'phone'

    return {
        isReady: isLoaded && Boolean(user),
        step,
        phoneForm,
        otpForm,
        isSendingSms,
        isVerifyingCode,
        phoneLastFour: phoneObj?.phoneNumber?.slice(-4),
        backupCodes,
        sendVerificationCode,
        resendCode,
        verifyCodeAndSetMfa,
    }
}
