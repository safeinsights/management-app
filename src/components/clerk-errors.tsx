import { errorToString, isClerkApiError } from '@/lib/errors'
import { Alert } from '@mantine/core'
import { WarningIcon } from '@phosphor-icons/react'
import { FC } from 'react'

// Custom error titles for Clerk error alerts
export const CLERK_ERROR_TITLES: Record<string, { title: string }> = {
    form_password_pwned: {
        title: 'Compromised Password',
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
        title = CLERK_ERROR_TITLES[clerkErr.code]?.title || title
        body = clerkErr.longMessage || clerkErr.message
    }

    return (
        <Alert color={'red'} icon={<WarningIcon />} title={title} withCloseButton onClose={onClose} mb="md">
            {body}
        </Alert>
    )
}
