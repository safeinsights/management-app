import { notifications } from '@mantine/notifications'
import { Alert, AlertProps, Flex, Text, useMantineTheme } from '@mantine/core'
import { Lock, Warning, WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { FC, ReactNode } from 'react'
import { errorToString, extractActionFailure, isServerActionError } from '@/lib/errors'
import { captureException } from '@sentry/nextjs'
import { difference } from 'remeda'

export * from '@/lib/errors'

export const reportError = (error: unknown, title = 'An error occurred') => {
    // TODO: consider whether we should send everything to sentry?
    if (isServerActionError(error)) {
        captureException(error)
    }
    notifications.show({
        color: 'red',
        title,
        message: errorToString(error),
    })
}

type FormErrorHandler = {
    setErrors(errs: Record<string, string>): void
    values: Record<string, string>
}
export function handleMutationErrorsWithForm(form: FormErrorHandler) {
    return (err: unknown) => {
        const failure = extractActionFailure(err)
        if (failure) {
            const formErrorKeys = Object.keys(failure)
            const fieldKeys = Object.keys(form.values)
            const nonFieldKeys = formErrorKeys.filter((k) => k !== 'form')

            const unknownKeys = difference(nonFieldKeys, fieldKeys)

            if (unknownKeys.length === 0) {
                form.setErrors(failure)
            } else {
                reportMutationError(err)
            }
        } else {
            reportError(err)
        }
    }
}

export const reportMutationError =
    (title = 'An error occurred') =>
    (err: unknown) =>
        reportError(err, title)

type ErrorAlertProps = { error: string | Error } & AlertProps

export const ErrorAlert: FC<ErrorAlertProps> = ({ icon = <Warning />, title = 'An error occurred', error }) => {
    return (
        <Alert variant="light" color="red" title={title} icon={icon}>
            {error.toString()}
        </Alert>
    )
}

type AccessDeniedAlertProps = { message?: string } & Omit<AlertProps, 'title'>

export const AccessDeniedAlert: FC<AccessDeniedAlertProps> = ({
    icon = <Lock />,
    message = 'You do not have permission to access this resource.',
    ...props
}) => {
    return (
        <Alert variant="light" color="yellow" title="Access Denied" icon={icon} {...props}>
            {message}
        </Alert>
    )
}

export const AlertNotFound: FC<{ title: string; message: ReactNode; hideIf?: boolean }> = ({
    title,
    message,
    hideIf,
}) => {
    if (hideIf) return null

    return (
        <Alert w="400" m="auto" variant="filled" color="red" icon={<Warning />} title={title}>
            {message}
        </Alert>
    )
}

export const InputError: FC<{ error: ReactNode }> = ({ error }) => {
    const theme = useMantineTheme()
    if (!error) return null

    return (
        <Flex align="center" gap={4} my={2} component="span" data-testid="input-error">
            <WarningCircle size={20} color={theme.colors.red[7]} weight="fill" />
            <Text c="red.7" size="xs" component="span">
                {error}
            </Text>
        </Flex>
    )
}
