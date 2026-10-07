'use client'

import { InputError } from '@/components/errors'
import { LoadingMessage } from '@/components/loading'
import OtpInput from '@/components/otp-input'
import { Box, Button, Center, Flex, Paper, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { FC } from 'react'
import { semanticColor } from '@/theme/tokens'
import { LinkInviteEmailStatus } from './use-link-invite-email'

type CodeForm = UseFormReturnType<{ code: string }>

type LinkEmailViewProps = {
    status: LinkInviteEmailStatus
    isSending: boolean
    invitedEmail: string
    orgName: string
    form: CodeForm
    onVerify: (values: { code: string }) => void
    onResend: () => void
    onSkip: () => void
}

const PreparingPanel: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return <LoadingMessage message="Preparing to link your email addresses" />
}

const CodePanel: FC<{
    isVisible: boolean
    isVerifying: boolean
    isSending: boolean
    invitedEmail: string
    orgName: string
    form: CodeForm
    onVerify: (values: { code: string }) => void
    onResend: () => void
    onSkip: () => void
}> = ({ isVisible, isVerifying, isSending, invitedEmail, orgName, form, onVerify, onResend, onSkip }) => {
    if (!isVisible) return null

    return (
        <form onSubmit={form.onSubmit(onVerify)}>
            <Stack gap="xs">
                <Title order={3} ta="center" mb="md">
                    Link your email addresses
                </Title>
                <Text size="md">
                    {invitedEmail} was invited to {orgName}. Enter the code we sent to {invitedEmail} to add it to your
                    account.
                </Text>
                <Center>
                    <OtpInput form={form} errorId="link-email-code-error" testId="link-email-pin-input" />
                </Center>
                <Box id="link-email-code-error" ta="center">
                    <InputError error={form.errors.code} />
                </Box>
                <Button type="submit" variant="filled" size="lg" loading={isVerifying} disabled={isSending} mb="xxs">
                    Verify and link
                </Button>
                <Button
                    variant="outline"
                    size="lg"
                    onClick={onResend}
                    loading={isSending}
                    disabled={isVerifying}
                    mb="xxs"
                >
                    Resend code
                </Button>
                <Button variant="subtle" size="lg" onClick={onSkip} disabled={isVerifying || isSending}>
                    Skip for now
                </Button>
            </Stack>
        </form>
    )
}

const FailedPanel: FC<{
    isVisible: boolean
    isSending: boolean
    invitedEmail: string
    orgName: string
    onResend: () => void
    onSkip: () => void
}> = ({ isVisible, isSending, invitedEmail, orgName, onResend, onSkip }) => {
    if (!isVisible) return null

    return (
        <Stack gap="xs">
            <Title order={3} ta="center" mb="md">
                We could not link this email address
            </Title>
            <Text size="md">
                You have been added to {orgName}, but we could not add {invitedEmail} to your account. You can try again
                now, or skip and finish later from your invitation email.
            </Text>
            <Button variant="filled" size="lg" onClick={onSkip} disabled={isSending} mb="xxs">
                Skip for now
            </Button>
            <Button variant="outline" size="lg" onClick={onResend} loading={isSending}>
                Try again
            </Button>
        </Stack>
    )
}

export const LinkEmailView: FC<LinkEmailViewProps> = ({
    status,
    isSending,
    invitedEmail,
    orgName,
    form,
    onVerify,
    onResend,
    onSkip,
}) => {
    const isAwaitingCode = status === 'awaiting-code' || status === 'verifying'

    return (
        <Paper bg={semanticColor('surface.raised')} p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
            <Flex direction="column" maw={500} mx="auto" pb="xxl" gap="xs">
                <PreparingPanel isVisible={status === 'loading'} />
                <CodePanel
                    isVisible={isAwaitingCode}
                    isVerifying={status === 'verifying'}
                    isSending={isSending}
                    invitedEmail={invitedEmail}
                    orgName={orgName}
                    form={form}
                    onVerify={onVerify}
                    onResend={onResend}
                    onSkip={onSkip}
                />
                <FailedPanel
                    isVisible={status === 'failed'}
                    isSending={isSending}
                    invitedEmail={invitedEmail}
                    orgName={orgName}
                    onResend={onResend}
                    onSkip={onSkip}
                />
            </Flex>
        </Paper>
    )
}
