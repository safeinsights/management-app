'use client'

import { InputError } from '@/components/errors'
import { LoadingMessage } from '@/components/loading'
import OtpInput from '@/components/otp-input'
import { Box, Button, Center, Flex, Paper, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { FC } from 'react'
import { LinkInviteEmailStatus } from './use-link-invite-email'

type CodeForm = UseFormReturnType<{ code: string }>

type LinkEmailViewProps = {
    status: LinkInviteEmailStatus
    invitedEmail: string
    orgName: string
    failureMessage: string | null
    form: CodeForm
    onVerify: (values: { code: string }) => void
    onResend: () => void
    onSkip: () => void
    onContinue: () => void
}

const PreparingPanel: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return <LoadingMessage message="Preparing to link your email addresses" />
}

const CodePanel: FC<{
    isVisible: boolean
    isVerifying: boolean
    invitedEmail: string
    orgName: string
    form: CodeForm
    onVerify: (values: { code: string }) => void
    onResend: () => void
    onSkip: () => void
}> = ({ isVisible, isVerifying, invitedEmail, orgName, form, onVerify, onResend, onSkip }) => {
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
                <Button type="submit" variant="filled" size="lg" loading={isVerifying} mb={4}>
                    Verify and link
                </Button>
                <Button variant="outline" size="lg" onClick={onResend} disabled={isVerifying} mb={4}>
                    Resend code
                </Button>
                <Button variant="subtle" size="lg" onClick={onSkip} disabled={isVerifying}>
                    Skip for now
                </Button>
            </Stack>
        </form>
    )
}

const UnavailablePanel: FC<{
    isVisible: boolean
    invitedEmail: string
    orgName: string
    onContinue: () => void
}> = ({ isVisible, invitedEmail, orgName, onContinue }) => {
    if (!isVisible) return null

    return (
        <Stack gap="xs">
            <Title order={3} ta="center" mb="md">
                We could not link this email address
            </Title>
            <Text size="md">
                We could not add {invitedEmail} to your account because it already belongs to another SafeInsights
                account. You have still been added to {orgName}.
            </Text>
            <Button variant="filled" size="lg" onClick={onContinue}>
                Continue
            </Button>
        </Stack>
    )
}

const FailedPanel: FC<{
    isVisible: boolean
    failureMessage: string | null
    onResend: () => void
    onSkip: () => void
}> = ({ isVisible, failureMessage, onResend, onSkip }) => {
    if (!isVisible) return null

    return (
        <Stack gap="xs">
            <Title order={3} ta="center" mb="md">
                We could not send your code
            </Title>
            <Text size="md" c="red.8">
                {failureMessage}
            </Text>
            <Button variant="filled" size="lg" onClick={onResend} mb={4}>
                Try again
            </Button>
            <Button variant="subtle" size="lg" onClick={onSkip}>
                Skip for now
            </Button>
        </Stack>
    )
}

export const LinkEmailView: FC<LinkEmailViewProps> = ({
    status,
    invitedEmail,
    orgName,
    failureMessage,
    form,
    onVerify,
    onResend,
    onSkip,
    onContinue,
}) => {
    const isPreparing = status === 'loading' || status === 'sending'
    const isAwaitingCode = status === 'awaiting-code' || status === 'verifying'

    return (
        <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
            <Flex direction="column" maw={500} mx="auto" pb="xxl" gap="xs">
                <PreparingPanel isVisible={isPreparing} />
                <CodePanel
                    isVisible={isAwaitingCode}
                    isVerifying={status === 'verifying'}
                    invitedEmail={invitedEmail}
                    orgName={orgName}
                    form={form}
                    onVerify={onVerify}
                    onResend={onResend}
                    onSkip={onSkip}
                />
                <UnavailablePanel
                    isVisible={status === 'unavailable'}
                    invitedEmail={invitedEmail}
                    orgName={orgName}
                    onContinue={onContinue}
                />
                <FailedPanel
                    isVisible={status === 'failed'}
                    failureMessage={failureMessage}
                    onResend={onResend}
                    onSkip={onSkip}
                />
            </Flex>
        </Paper>
    )
}
