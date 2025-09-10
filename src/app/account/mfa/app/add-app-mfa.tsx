'use client'

import { useEffect, useMemo, useState } from '@/common'
import { InputError, reportError } from '@/components/errors'
import { Link } from '@/components/links'
import logger from '@/lib/logger'
import { useUser } from '@clerk/nextjs'
import { TOTPResource } from '@clerk/types'
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    CopyButton,
    Group,
    Paper,
    PinInput,
    rgba,
    Stack,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { CaretLeftIcon, CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { QRCodeSVG } from 'qrcode.react'
import BackupCodes from './backup-codes'

type AddTotpSteps = 'add' | 'verify' | 'success'

type DisplayFormat = 'qr' | 'uri'

export const dynamic = 'force-dynamic'

function AddTotpScreenContent({
    setStep,
    setBackupCodes,
}: {
    setStep: React.Dispatch<React.SetStateAction<AddTotpSteps>>
    setBackupCodes: React.Dispatch<React.SetStateAction<string[] | null>>
}) {
    const theme = useMantineTheme()
    const { user } = useUser()
    const [totp, setTOTP] = useState<TOTPResource | undefined>(undefined)
    const [canRegenerate, setCanRegenerate] = useState(true)
    const [displayFormat, setDisplayFormat] = useState<DisplayFormat>('qr')
    const [isVerifying, setIsVerifying] = useState(false)

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
            code: (value: string) => (value.length !== 6 ? 'Code must be 6 digits' : null),
        },
    })

    const verifyTotp = async (values: { code: string }) => {
        setIsVerifying(true)
        try {
            await user?.verifyTOTP({ code: values.code })
            // Generate backup codes after verification
            if (user && !user.backupCodeEnabled) {
                try {
                    const resource = await user.createBackupCode()
                    setBackupCodes(resource.codes || [])
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

    useEffect(() => {
        void user
            ?.createTOTP()
            .then((totp: TOTPResource) => {
                setTOTP(totp)
            })
            .catch((err) => reportError(err, 'Error generating MFA'))
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Stack mb="xxl">
            <Title mb="xs" ta="center" order={3}>
                Authenticator app verification
            </Title>
            <Text size="md">
                Open your authenticator app and scan the QR code to link your account. If you&apos;re unable to scan the
                code, you can enter the setup key manually.
            </Text>
            <Text size="md" mb="xs">
                Once set up, enter the verification code from the app to complete the process.
            </Text>
            <Stack align="center" gap="xs">
                {totp && displayFormat === 'qr' && (
                    <>
                        <Box bg={rgba(theme.colors.grey[0], 0.3)} p={6}>
                            <QRCodeSVG value={totp?.uri || ''} size={150} />
                        </Box>
                        {secret && (
                            <Group align="center">
                                <Text size="sm">{secret}</Text>
                                <CopyButton value={secret} timeout={800}>
                                    {({ copied, copy }) => (
                                        <Tooltip label={copied ? 'Copied' : 'Copy'} offset={10}>
                                            <ActionIcon
                                                variant="subtle"
                                                color={copied ? 'green' : undefined}
                                                onClick={copy}
                                                aria-label="Copy secret key"
                                            >
                                                {copied ? (
                                                    <CheckIcon size={24} />
                                                ) : (
                                                    <CopyIcon size={24} color={theme.colors.gray[8]} />
                                                )}
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </CopyButton>
                            </Group>
                        )}
                        <Text size="sm">
                            <span style={{ color: theme.colors.grey[7] }}>Having trouble?</span>{' '}
                            <Anchor
                                component="button"
                                c="blue.7"
                                underline="always"
                                style={{
                                    opacity: canRegenerate ? 1 : 0.4,
                                    cursor: canRegenerate ? 'pointer' : 'not-allowed',
                                }}
                                disabled={!canRegenerate}
                                onClick={async () => {
                                    try {
                                        const newTotp = await user?.createTOTP()
                                        setTOTP(newTotp)
                                        setCanRegenerate(false)
                                        setTimeout(() => setCanRegenerate(true), 30000)
                                    } catch (err) {
                                        reportError(err, 'Error regenerating QR code')
                                    }
                                }}
                            >
                                Regenerate QR code
                            </Anchor>
                        </Text>
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
            </Stack>
            <form onSubmit={form.onSubmit(verifyTotp)}>
                <Stack align="center" gap="xs">
                    <Title order={4} ta="center" mt="xs">
                        Enter your code
                    </Title>
                    <PinInput
                        length={6}
                        size="lg"
                        type="number"
                        value={form.values.code}
                        error={Boolean(form.errors.code)}
                        placeholder="0"
                        {...form.getInputProps('code')}
                    />
                    <InputError error={form.errors.code} />
                    <Button
                        type="submit"
                        loading={isVerifying}
                        fullWidth
                        disabled={!/^\d{6}$/.test(form.values.code)}
                        size="lg"
                        mt="md"
                    >
                        Verify code
                    </Button>
                    <Link
                        href="/account/mfa"
                        mt="md"
                        c="purple.5"
                        fw={600}
                        fz="md"
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        <CaretLeftIcon size={20} />
                        Back to options
                    </Link>
                </Stack>
            </form>
        </Stack>
    )
}

export function AddAppMFA() {
    const [step, setStep] = useState<AddTotpSteps>('add')
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
    const { isLoaded, user } = useUser()

    if (!isLoaded) return null

    if (!user) {
        return <Text>You must be logged in to access this page</Text>
    }

    return (
        <Paper bg="white" p="xxl" radius="sm" maw={500} my={{ base: '1rem', lg: 0 }}>
            {step === 'add' && <AddTotpScreenContent setStep={setStep} setBackupCodes={setBackupCodes} />}
            {step === 'success' && <BackupCodes codes={backupCodes} />}
        </Paper>
    )
}
