'use client'

import type { FC, ReactNode } from 'react'
import { semanticColor } from '@/theme/tokens'
import { InputError } from '@/components/errors'
import { Alert, Button, Flex, Paper, PasswordInput, Text, TextInput, Title, Stack } from '@mantine/core'
import {
    AcknowledgementCheckbox,
    globalDocAgreementLabel,
    participationAgreementLabel,
    TosPnPreview,
} from '@/components/legal/signup-acknowledgement/acknowledgement-checkbox'
import { useSetupAccountForm, type InviteData } from './use-setup-account-form'

const LegalDocumentsError: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <Alert color="red" title="There was an error loading the document">
            Reload the page to try again. Your invitation is still valid.
        </Alert>
    )
}

type FormErrorAlertProps = {
    isVisible: boolean
    title: string
    body: ReactNode
    onClose: () => void
}

const FormErrorAlert: FC<FormErrorAlertProps> = ({ isVisible, title, body, onClose }) => {
    if (!isVisible) return null

    return (
        <Alert color="red" title={title} withCloseButton onClose={onClose}>
            {body}
        </Alert>
    )
}

export const SetupAccountForm: FC<InviteData> = (invite) => {
    const { email, orgName } = invite
    const {
        form,
        tosPn,
        tosPnError,
        participationAgreement,
        participationAgreementError,
        canSubmit,
        isCreating,
        createAccount,
        requirementsDescription,
        markPasswordTouched,
        formError,
    } = useSetupAccountForm(invite)

    return (
        <Paper bg={semanticColor('surface.raised')} p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
            <form onSubmit={form.onSubmit((values) => createAccount(values))}>
                <Flex direction="column" gap="lg" maw={500} mx="auto" pb="xxl">
                    <Title mb="lg" order={3} ta="center">
                        Welcome to SafeInsights!
                    </Title>
                    <Text size="md">
                        You’ve been invited to join {orgName}. Please fill out the details below to create your account.
                    </Text>
                    <TextInput label="Email" radius="sm" value={email} disabled c={semanticColor('text.primary')} />

                    <Flex direction="row" gap="xl">
                        <TextInput
                            radius="sm"
                            flex="1"
                            key={form.key('firstName')}
                            {...form.getInputProps('firstName')}
                            label="First name"
                            placeholder="Enter your first name"
                            error={form.errors.firstName && <InputError error={form.errors.firstName} />}
                        />

                        <TextInput
                            radius="sm"
                            flex="1"
                            key={form.key('lastName')}
                            {...form.getInputProps('lastName')}
                            label="Last name"
                            placeholder="Enter your last name"
                            error={form.errors.lastName && <InputError error={form.errors.lastName} />}
                        />
                    </Flex>
                    <PasswordInput
                        radius="sm"
                        label="Enter password"
                        key={form.key('password')}
                        placeholder="********"
                        {...form.getInputProps('password')}
                        onBlur={(event) => {
                            form.getInputProps('password').onBlur?.(event)
                            markPasswordTouched()
                        }}
                        // Suppressed in favor of the requirements list below.
                        error={undefined}
                        aria-invalid={!!form.errors.password || undefined}
                        // Rendered as the description so Mantine owns the aria-describedby wiring.
                        description={requirementsDescription}
                        // Below the input, not Mantine's default above: this is live validation
                        // feedback.
                        inputWrapperOrder={['label', 'input', 'description', 'error']}
                    />

                    <PasswordInput
                        radius="sm"
                        label="Confirm password"
                        key={form.key('confirmPassword')}
                        placeholder="********"
                        {...form.getInputProps('confirmPassword')}
                        error={form.errors.confirmPassword && <InputError error={form.errors.confirmPassword} />}
                        // PasswordInput's inner <input> has withAria disabled, so `error` alone
                        // never marks it invalid to assistive tech (OTTER-647).
                        aria-invalid={!!form.errors.confirmPassword || undefined}
                    />

                    <FormErrorAlert {...formError} />

                    <Stack>
                        <LegalDocumentsError isVisible={tosPnError} />
                        <TosPnPreview documents={tosPn} />
                        <AcknowledgementCheckbox
                            label={globalDocAgreementLabel(tosPn)}
                            checked={form.values.termsAccepted}
                            onChange={(checked) => form.setFieldValue('termsAccepted', checked)}
                            onBlur={() => form.validateField('termsAccepted')}
                            error={form.errors.termsAccepted}
                        />
                        <LegalDocumentsError isVisible={participationAgreementError} />
                        <AcknowledgementCheckbox
                            label={participationAgreementLabel(participationAgreement)}
                            checked={form.values.participationAccepted}
                            onChange={(checked) => form.setFieldValue('participationAccepted', checked)}
                            onBlur={() => form.validateField('participationAccepted')}
                            error={form.errors.participationAccepted}
                        />
                    </Stack>

                    <Flex mt="sm">
                        <Button type="submit" loading={isCreating} disabled={!canSubmit} w="100%" size="lg">
                            Create account
                        </Button>
                    </Flex>
                </Flex>
            </form>
        </Paper>
    )
}
