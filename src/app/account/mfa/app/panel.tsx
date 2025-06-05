'use client'

import { useUser } from '@clerk/nextjs'
import { TOTPResource } from '@clerk/types'
import React, { useState, useMemo, useEffect } from 'react'
import { z } from 'zod'
import { zodResolver } from 'mantine-form-zod-resolver'
import { QRCodeSVG } from 'qrcode.react'
import { useForm } from '@mantine/form'
import { Button, TextInput, Text, Stack, Group, Container, Box } from '@mantine/core'
import { errorToString, reportError } from '@/components/errors'
import { Panel } from '@/components/panel'
import { ButtonLink } from '@/components/links'
import logger from '@/lib/logger'
import { useRouter, useSearchParams } from 'next/navigation'
import { onPendingUserLoginAction } from '@/app/account/invitation/[inviteId]/invite.actions' // Adjust path if needed
import { notifications } from '@mantine/notifications'

type AddTotpSteps = 'add' | 'verify' | 'success'

type DisplayFormat = 'qr' | 'uri'

export const dynamic = 'force-dynamic'

function AddTotpScreenContent({ setStep, onMfaSuccess }: { setStep: React.Dispatch<React.SetStateAction<AddTotpSteps>>; onMfaSuccess: () => Promise<void> }) {
    const { user } = useUser()
    const [totp, setTOTP] = useState<TOTPResource | undefined>(undefined)
    const [displayFormat, setDisplayFormat] = useState<DisplayFormat>('qr')
    const secret = useMemo(() => {
        if (totp?.uri) {
            try {
                const url = new URL(totp.uri)
                return url.searchParams.get('secret')
            } catch (err) {
                logger.error({ err, message: 'Error parsing TOTP URI' })
                return null
            }
        }
        return null
    }, [totp])

    const schema = z.object({
        code: z.string().regex(/^\d{6}$/, { message: 'Code must be six digits' }),
    })

    const form = useForm({
        initialValues: {
            code: '',
        },
        validate: zodResolver(schema),
        validateInputOnChange: true,
    })

    const verifyTotp = async (values: { code: string }) => {
        try {
            await user?.verifyTOTP({ code: values.code })
            await onMfaSuccess() // Call the success handler
            setStep('success')
        } catch (err: unknown) {
            form.setErrors({ code: errorToString(err) || 'Invalid Code' })
        }
    }

    React.useEffect(() => {
        void user
            ?.createTOTP()
            .then((totp: TOTPResource) => {
                setTOTP(totp)
            })
            .catch((err) => reportError(err, 'Error generating TOTP for MFA'))
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            <Text size="md" mb={60} ta="center">
                Open your preferred authenticator app and scan this QR code.
                <br />
                Once setup, enter the code from the app into the field below to complete the process.
            </Text>
            <Stack gap="md" mb={60} align="center">
                {totp && displayFormat === 'qr' && (
                    <>
                        <QRCodeSVG value={totp?.uri || ''} size={200} />
                        {secret && (
                            <Text mt="sm" size="xs">
                                {secret}
                            </Text>
                        )}
                        {/* <Button onClick={() => setDisplayFormat('uri')}>Use URI instead</Button> */}
                    </>
                )}
                {totp && displayFormat === 'uri' && (
                    <>
                        <div>
                            <Text>{totp.uri}</Text>
                        </div>
                        <Button onClick={() => setDisplayFormat('qr')}>Use QR Code instead</Button>
                    </>
                )}
                {/* <Button onClick={() => setStep('add')}>Re-generate</Button> */}
            </Stack>
            <Text mt={60} size="md" ta="center">
                Enter a generated code
            </Text>
            <form onSubmit={form.onSubmit(verifyTotp)}>
                <Box mb="lg" maw="30%" mx="auto">
                    <TextInput
                        autoFocus
                        maxLength={6}
                        name="code"
                        placeholder="000000"
                        styles={(_theme) => ({ input: { textAlign: 'center' } })}
                        {...(function () {
                            const { error, ...rest } = form.getInputProps('code')
                            return rest
                        })()}
                    />
                    <Text c="red" size="xs" ta="center">
                        {form.errors.code || '\u00A0'}
                    </Text>
                </Box>
                <Group gap="lg" justify="center">
                    <Button type="submit" disabled={!/^\d{6}$/.test(form.values.code)} miw={150} mih={40}>
                        Verify Code
                    </Button>
                </Group>
            </form>
        </>
    )
}

function VerifyTotpScreenContent({ setStep }: { setStep: React.Dispatch<React.SetStateAction<AddTotpSteps>> }) {
    const { user } = useUser()
    const schema = z.object({
        code: z.string().regex(/^\d{6}$/, { message: 'Code must be six digits' }),
    })

    const form = useForm({
        initialValues: { code: '' },
        validate: zodResolver(schema),
        validateInputOnChange: true,
    })

    const verifyTotp = async (values: { code: string }) => {
        try {
            await user?.verifyTOTP({ code: values.code })
            setStep('success')
        } catch (err: unknown) {
            form.setErrors({ code: errorToString(err) || 'Invalid Code' })
        }
    }

    return (
        <form onSubmit={form.onSubmit(verifyTotp)}>
            <Box mb="lg">
                <TextInput
                    autoFocus
                    maxLength={8}
                    name="code"
                    label="Enter the code from your authentication app"
                    placeholder="000 000"
                    {...(function () {
                        const { error, ...rest } = form.getInputProps('code')
                        return rest
                    })()}
                />
                <Text c="red" size="xs">
                    {form.errors.code || '\u00A0'}
                </Text>
            </Box>
            <Group gap="lg" justify="center">
                <Button variant="light" onClick={() => setStep('add')}>
                    Retry
                </Button>
                <Button type="submit" miw={150} mih={40}>
                    Verify code
                </Button>
            </Group>
        </form>
    )
}

function SuccessScreenContent() {
    return (
        <Stack gap="lg">
            <Text>You have successfully added TOTP MFA with an authentication application.</Text>
            <ButtonLink href="/">Return to homepage</ButtonLink>
        </Stack>
    )
}

export function AddMFAPanel() {
    const [step, setStep] = React.useState<AddTotpSteps>('add')
    const { isLoaded, user } = useUser()
    const router = useRouter()
    const searchParams = useSearchParams()

    const handleMfaSuccess = async () => {
        const inviteId = searchParams.get('inviteId')
        const clerkUserId = searchParams.get('clerkUserId')
        const postMfaAction = searchParams.get('postMfaAction')

        if (postMfaAction === 'claimInvite' && inviteId && clerkUserId) {
            try {
                await onPendingUserLoginAction({ inviteId, userId: clerkUserId })
                notifications.show({
                    title: 'Invitation Claimed',
                    message: 'You have successfully joined the organization.',
                    color: 'green',
                })
            } catch (error) {
                reportError(error, 'Failed to claim invitation after MFA setup.')
                notifications.show({
                    title: 'Error Finalizing Invite',
                    message: 'MFA setup was successful, but there was an issue finalizing your organization membership. Please contact support.',
                    color: 'red',
                    autoClose: false,
                })
            }
        }
    }

    if (!isLoaded) return null
    if (!user) {
        notifications.show({ message: 'You must be logged in to access this page. Redirecting...', color: 'blue' })
        router.push('/account/signin') // Or appropriate sign-in page
        return <LoadingMessage message="Redirecting to sign in..." />
    }

    let panelTitle = ''
    switch (step) {
        case 'add':
            panelTitle = 'Authenticator App Verification'
            break
        case 'verify':
            panelTitle = 'Verify Your Code'
            break
        case 'success':
            panelTitle = 'Success!'
            break
        default:
            panelTitle = ''
    }

    return (
        <Container>
            <Panel title={panelTitle}>
                {step === 'add' && <AddTotpScreenContent setStep={setStep} onMfaSuccess={handleMfaSuccess} />}
                {step === 'verify' && <VerifyTotpScreenContent setStep={setStep} />}
                {step === 'success' && <SuccessScreenContent />}
            </Panel>
        </Container>
    )
}
