import { errorToString, isClerkApiError } from '@/lib/errors'
import { Alert } from '@mantine/core'
import { WarningIcon } from '@phosphor-icons/react'
import { FC } from 'react'

// Custom copy for Clerk error alerts; `message` replaces Clerk's wording when it is
// too vague for end users (OTTER-597)
export const CLERK_ERROR_COPY: Record<string, { title: string; message?: string }> = {
    form_password_pwned: {
        title: 'Compromised Password',
        message:
            'This password was found in a database of known breached passwords and cannot be used. ' +
            'Please choose a different password.',
    },
    verification_failed: {
        title: 'Too Many Attempts',
    },
}

interface ClerkErrorAlertProps {
    error: unknown
    onClose?: () => void
}

export const ClerkErrorAlert: FC<ClerkErrorAlertProps> = ({ error, onClose }) => {
    if (!error) return null

    let title = 'An Error Occurred'
    let body = errorToString(error)

    if (isClerkApiError(error)) {
        const clerkErr = error.errors[0]
        const copy = CLERK_ERROR_COPY[clerkErr.code]
        title = copy?.title || title
        body = copy?.message || clerkErr.longMessage || clerkErr.message
    }

    return (
        <Alert color={'red'} icon={<WarningIcon />} title={title} withCloseButton onClose={onClose} mb="md">
            {body}
        </Alert>
    )
}
