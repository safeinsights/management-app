'use client'

import { FC, FormEvent } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { Flex, Paper, Stack, TextInput, Title } from '@mantine/core'
import { Button } from '@/common'
import { BackLink } from '@/components/links'
import { Routes } from '@/lib/routes'
import { semanticColor } from '@/theme/tokens'

export type ResetFormValues = {
    email: string
}

export type ResetFormViewProps = {
    form: UseFormReturnType<ResetFormValues>
    onSubmit: (event?: FormEvent<HTMLFormElement>) => void
    isPending: boolean
}

export const ResetFormView: FC<ResetFormViewProps> = ({ form, onSubmit, isPending }) => {
    return (
        <form onSubmit={onSubmit}>
            <Paper bg={semanticColor('surface.raised')} shadow="none" p="xxl">
                <Flex direction="column" gap="md" mb="lg">
                    <Title mb="xs" ta="center" order={3}>
                        Reset your password
                    </Title>

                    <TextInput
                        key={form.key('email')}
                        {...form.getInputProps('email')}
                        label="Enter registered email"
                        placeholder="Email address"
                        aria-label="Email"
                    />
                    <Stack align="center" gap="xs">
                        <Button w="100%" mt="xs" type="submit" size="lg" loading={isPending} disabled={!form.isValid()}>
                            Send Verification Code
                        </Button>
                        <BackLink href={Routes.accountSignin}>Back to log in</BackLink>
                    </Stack>
                </Flex>
            </Paper>
        </form>
    )
}
