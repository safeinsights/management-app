'use client'

import type { FC } from 'react'
import { Box, Group, Text } from '@mantine/core'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'

/** Referenced by the submit button's aria-describedby, so both sides share one definition. */
export const SUBMIT_CODE_ERROR_ID = 'submit-code-error'

export const NO_CHANGES_MESSAGE =
    'No changes have been made to your file yet. Update your code before submitting for review.'

const ErrorContent: FC<{ message: string | null }> = ({ message }) => {
    if (!message) return null

    return (
        <Group gap={6} wrap="nowrap" align="center">
            <WarningCircleIcon size={16} weight="fill" color="var(--mantine-color-red-7)" aria-hidden />
            <Text size="sm" c="red.7">
                {message}
            </Text>
        </Group>
    )
}

/**
 * The blocked-submission message (OTTER-693 row 10). Sits under the files table rather than beside
 * the button, which is where the design puts it — next to the thing the researcher has to change.
 *
 * The region is mounted even when empty, and never conditionally rendered: a live region is only
 * announced when content it already owns changes, and `aria-describedby` on the button has to
 * resolve to something for the error to stay discoverable on tabbing back.
 */
export const SubmitCodeError: FC<{ message: string | null }> = ({ message }) => (
    <Box id={SUBMIT_CODE_ERROR_ID} aria-live="polite">
        <ErrorContent message={message} />
    </Box>
)
