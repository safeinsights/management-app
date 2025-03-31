'use client'

import { useUser } from '@clerk/nextjs'
import { TOTPResource } from '@clerk/types'
import React, { useState, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { GenerateBackupCodes } from '../backup-codes'
import { useForm } from '@mantine/form'
import { Button, TextInput, Text, Stack, Group, Container, Box } from '@mantine/core'
import { errorToString, reportError } from '@/components/errors'
import { Panel } from '@/components/panel'
import { ButtonLink } from '@/components/links'
import logger from '@/lib/logger'

type AddTotpSteps = 'add' | 'verify' | 'backupcodes' | 'success'

type DisplayFormat = 'qr' | 'uri'

function AddTotpScreenContent({ setStep }: { setStep: React.Dispatch<React.SetStateAction<AddTotpSteps>> }) {
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

    const form = useForm({
        initialValues: {
            code: '',
        },
        validate: {
            code: (c: string) => (/^\d{6}$/.test(c) ? null : 'Code must be six digits'),
        },
        validateInputOnChange: true,
    })

    const verifyTotp = async (values: { code: string }) => {
        try {
            await user?.verifyTOTP({ code: values.code })
            setStep('backupcodes')
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
            .catch((err) => reportError(err, 'Error generating MFA'))
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
                        maxLength={8}
                        name="code"
                        placeholder="000000"
                        styles={(_theme) => ({ input: { textAlign: 'center' } })}
                        {...(function () {
                            const { error, ...rest } = form.getInputProps('code')
                            return rest
                        })()}
                    />
                    <Text color="red" size="xs" ta="center">
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
    const form = useForm({
        initialValues: { code: '' },
        validate: {
            code: (c: string) => (/^\d{6}$/.test(c) ? null : 'Code must be six digits'),
        },
        validateInputOnChange: true,
    })

    const verifyTotp = async (values: { code: string }) => {
        try {
            await user?.verifyTOTP({ code: values.code })
            setStep('backupcodes')
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
                <Text color="red" size="xs">
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

function BackupCodeScreenContent({ setStep }: { setStep: React.Dispatch<React.SetStateAction<AddTotpSteps>> }) {
    return (
        <Stack gap="lg">
            <Text>
                Save this list of backup codes somewhere safe in case you need to access your account in an emergency.
            </Text>
            <GenerateBackupCodes />
            <Button onClick={() => setStep('success')}>Finish</Button>
        </Stack>
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

export default function AddMFaScreen() {
    const [step, setStep] = React.useState<AddTotpSteps>('add')
    const { isLoaded, user } = useUser()

    if (!isLoaded) return null

    if (!user) {
        return <Text>You must be logged in to access this page</Text>
    }

    let panelTitle = ''
    switch (step) {
        case 'add':
            panelTitle = 'Authenticator App Verification'
            break
        case 'verify':
            panelTitle = 'Verify Your Code'
            break
        case 'backupcodes':
            panelTitle = 'Backup Codes'
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
                {step === 'add' && <AddTotpScreenContent setStep={setStep} />}
                {step === 'verify' && <VerifyTotpScreenContent setStep={setStep} />}
                {step === 'backupcodes' && <BackupCodeScreenContent setStep={setStep} />}
                {step === 'success' && <SuccessScreenContent />}
            </Panel>
        </Container>
    )
}
