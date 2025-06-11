'use client'

import { useUser, useClerk } from '@clerk/nextjs'
import { TOTPResource } from '@clerk/types'
import React, { useState, useMemo } from 'react'
import { z } from 'zod'
import { zodResolver } from 'mantine-form-zod-resolver'
import { QRCodeSVG } from 'qrcode.react'
import { useForm } from '@mantine/form'
import { Button, TextInput, Text, Stack, Group, Container, Box } from '@mantine/core'
import { errorToString, reportError } from '@/components/errors'
import { Panel } from '@/components/panel'
import { ButtonLink } from '@/components/links'
import logger from '@/lib/logger'
import { useRouter } from 'next/navigation'
import { claimInviteAction } from '@/app/account/invitation/[inviteId]/invite.actions' // Adjust path if needed
import { notifications } from '@mantine/notifications'
import { LoadingMessage } from '@/components/loading'
import { useDashboardUrl } from '@/lib/dashboard-url'

type AddTotpSteps = 'add' | 'verify' | 'success'

type DisplayFormat = 'qr' | 'uri'

export const dynamic = 'force-dynamic'

function AddTotpScreenContent({
    setStep,
    onMfaSuccess,
}: {
    setStep: React.Dispatch<React.SetStateAction<AddTotpSteps>>
    onMfaSuccess: () => Promise<void>
}) {
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
    const dashboardUrl = useDashboardUrl()
    return (
        <Stack gap="lg">
            <Text>You have successfully added TOTP MFA with an authentication application.</Text>
            <ButtonLink href={dashboardUrl}>Visit your dashboard</ButtonLink>
        </Stack>
    )
}

export function AddMFAPanel() {
    const [step, setStep] = React.useState<AddTotpSteps>('add')
    const { isLoaded, user } = useUser()
    const { setActive } = useClerk()
    const router = useRouter()

    const handleMfaSuccess = async () => {
        const inviteId = localStorage.getItem('pendingInviteId')

        if (inviteId) {
            localStorage.removeItem('pendingInviteId')
            try {
                const result = await claimInviteAction({ inviteId })
                if (result.success) {
                    notifications.show({
                        title: 'Invitation Claimed',
                        message: `You have successfully joined ${result.organizationName}.`,
                        color: 'green',
                    })
                    // switch active org for reviewer-only invitees
                    if (result.orgSlug) {
                        const orgMeta = user?.publicMetadata?.orgs?.find((o) => o.slug === result.orgSlug)
                        if (orgMeta?.isReviewer) {
                            try {
                                await setActive({ organization: result.orgSlug })
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                } else {
                    // This case is unlikely to be hit since the action throws, but is good for robustness
                    reportError(result.error || 'Failed to claim invitation after MFA setup.')
                }
            } catch (error) {
                reportError(error, 'Failed to claim invitation after MFA setup.')
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
