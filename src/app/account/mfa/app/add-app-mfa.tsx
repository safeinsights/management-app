'use client'

import type { FC } from 'react'
import { ActionIcon, Anchor, Box, Button, CopyButton, Group, Paper, rgba, Stack, Text, Title } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { QRCodeSVG } from 'qrcode.react'
import { InputError } from '@/components/errors'
import { BackLink } from '@/components/links'
import OtpInput from '@/components/otp-input'
import { InfoTooltip } from '@/components/tooltip'
import { Routes } from '@/lib/routes'
import { semanticColor } from '@/theme/tokens'
import BackupCodes from './backup-codes'
import { useAddAppMfa } from './use-add-app-mfa'

const SecretKey: FC<{ secret: string | null }> = ({ secret }) => {
    if (!secret) return null

    return (
        <Group align="center">
            <Text size="sm">{secret}</Text>
            <CopyButton value={secret} timeout={800}>
                {({ copied, copy }) => (
                    <InfoTooltip label={copied ? 'Copied' : 'Copy'} offset={10}>
                        <ActionIcon
                            variant="subtle"
                            color={copied ? 'green' : undefined}
                            onClick={copy}
                            aria-label="Copy secret key"
                        >
                            {copied ? (
                                <CheckIcon size={24} />
                            ) : (
                                <CopyIcon size={24} color={semanticColor('icon.dark')} />
                            )}
                        </ActionIcon>
                    </InfoTooltip>
                )}
            </CopyButton>
        </Group>
    )
}

type QrCodePanelProps = {
    uri?: string
    secret: string | null
    canRegenerate: boolean
    onRegenerate: () => void
}

const QrCodePanel: FC<QrCodePanelProps> = ({ uri, secret, canRegenerate, onRegenerate }) => {
    if (!uri) return null

    return (
        <>
            <Box bg={rgba(semanticColor('surface.page'), 0.3)} p="xs">
                <QRCodeSVG value={uri} size={150} />
            </Box>
            <SecretKey secret={secret} />
            <Text size="sm">
                <Box component="span" c={semanticColor('text.secondary')}>
                    Having trouble?
                </Box>{' '}
                <Anchor
                    component="button"
                    c={semanticColor('link.default')}
                    underline="always"
                    opacity={canRegenerate ? 1 : 0.4}
                    disabled={!canRegenerate}
                    onClick={onRegenerate}
                >
                    Regenerate QR code
                </Anchor>
            </Text>
        </>
    )
}

type AddTotpStepProps = QrCodePanelProps & {
    isVisible: boolean
    form: UseFormReturnType<{ code: string }>
    isVerifying: boolean
    onVerify: (values: { code: string }) => void
}

const AddTotpStep: FC<AddTotpStepProps> = ({ isVisible, form, isVerifying, onVerify, ...qrProps }) => {
    if (!isVisible) return null

    return (
        <Stack mb="xxl">
            <Title mb="xs" ta="center" order={3}>
                Authenticator app verification
            </Title>
            <Text size="md">
                Open your authenticator app and scan the QR code to link your account. If you’re unable to scan the
                code, you can enter the setup key manually.
            </Text>
            <Text size="md" mb="xs">
                Once set up, enter the verification code from the app to complete the process.
            </Text>
            <Stack align="center" gap="xs">
                <QrCodePanel {...qrProps} />
            </Stack>
            <form onSubmit={form.onSubmit(onVerify)}>
                <Stack align="center" gap="xs">
                    <Title order={4} ta="center" mt="xs">
                        Enter your code
                    </Title>
                    <OtpInput form={form} errorId="add-app-mfa-code-error" />
                    <Box id="add-app-mfa-code-error">
                        <InputError error={form.errors.code} />
                    </Box>
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
                    <BackLink href={Routes.accountMfa}>Back to options</BackLink>
                </Stack>
            </form>
        </Stack>
    )
}

export function AddAppMFA() {
    const { isReady, step, backupCodes, totpUri, secret, canRegenerate, isVerifying, form, regenerate, verifyTotp } =
        useAddAppMfa()

    if (!isReady) return null

    return (
        <Paper bg={semanticColor('surface.raised')} p="xxl" radius="sm" maw={500} my={{ base: '1rem', lg: 0 }}>
            <AddTotpStep
                isVisible={step === 'add'}
                uri={totpUri}
                secret={secret}
                canRegenerate={canRegenerate}
                onRegenerate={regenerate}
                form={form}
                isVerifying={isVerifying}
                onVerify={verifyTotp}
            />
            <BackupCodes isVisible={step === 'success'} codes={backupCodes} />
        </Paper>
    )
}
