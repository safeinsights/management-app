'use client'

import { FC, FormEvent } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { Flex, Paper, Stack, TextInput, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { Button, Link } from '@/common'
import { Routes } from '@/lib/routes'

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
            <Paper bg="white" shadow="none" p="xxl">
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
                        <Link
                            href={Routes.accountSignin}
                            mt="md"
                            c="purple.5"
                            fw={600}
                            fz="md"
                            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                            <CaretLeftIcon size={20} />
                            Back to log in
                        </Link>
                    </Stack>
                </Flex>
            </Paper>
        </form>
    )
}
