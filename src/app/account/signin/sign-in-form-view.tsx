'use client'

import { FC, FormEvent } from 'react'
import type { Route } from 'next'
import { type UseFormReturnType } from '@mantine/form'
import { Paper, PasswordInput, TextInput, Title } from '@mantine/core'
import { Button, Flex, Link } from '@/common'
import { SignInError } from './sign-in-error'

// Presentational sign-in card ("Welcome to SafeInsights!"). It owns the white Paper, the
// Email + Password fields, the "Forgot password?" link, the inline Clerk-error banner, and the
// disabled-until-valid Login button. Kept in its OWN file free of Clerk hooks (useSignIn /
// useUser / useAuth) and the MFA/redirect logic so it renders in isolation (e.g. Ladle). The
// SignInForm container owns the form, submit handler, and Clerk error state and injects them here.

export type SignInFormValues = {
    email: string
    password: string
}

export type SignInFormViewProps = {
    form: UseFormReturnType<SignInFormValues>
    onSubmit: (event?: FormEvent<HTMLFormElement>) => void
    forgotPasswordHref: Route
    clerkError: { title: string; message: string } | null
    setClerkError: (error: { title: string; message: string } | null) => void
}

export const SignInFormView: FC<SignInFormViewProps> = ({
    form,
    onSubmit,
    forgotPasswordHref,
    clerkError,
    setClerkError,
}) => {
    return (
        <form onSubmit={onSubmit}>
            <Paper bg="white" radius="sm" p="xxl">
                <Title mb="lg" order={3} ta="center">
                    Welcome to SafeInsights!
                </Title>
                <Flex direction="column" gap="xs">
                    <TextInput
                        key={form.key('email')}
                        {...form.getInputProps('email')}
                        label="Email"
                        placeholder="Enter your registered email address"
                        aria-label="Email"
                    />
                    <PasswordInput
                        label="Password"
                        key={form.key('password')}
                        {...form.getInputProps('password')}
                        mt={10}
                        placeholder="*********"
                        aria-label="Password"
                    />
                    <Link c="blue.7" fw={600} w="fit-content" size="xs" href={forgotPasswordHref}>
                        Forgot password?
                    </Link>
                    <SignInError clerkError={clerkError} setClerkError={setClerkError} />
                    <Button
                        mt="md"
                        mb="xxl"
                        size="lg"
                        disabled={!form.isValid()}
                        type="submit"
                        bg={!form.isValid() ? 'grey.1' : undefined}
                    >
                        Login
                    </Button>
                </Flex>
            </Paper>
        </form>
    )
}
