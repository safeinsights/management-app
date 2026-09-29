'use client'

import type { FC, RefObject } from 'react'
import { Anchor, Stack, Text, Title } from '@mantine/core'
import { ACCEPTED_FILE_FORMATS_TEXT } from '@/lib/types'
import { semanticColor } from '@/theme/tokens'

const SECTION_TITLE = 'Already have code?'

const UPLOAD_LINK_TEXT = 'Upload your existing files'

/** Built from the shared constant so the list cannot drift from what the dropzone accepts. */
const LIMITS_TEXT = `(${ACCEPTED_FILE_FORMATS_TEXT} File size: 3 MB max.)`

type AlreadyHaveCodeSectionProps = {
    isVisible?: boolean
    /** Opens the dropzone's native file picker; shared with the card's Upload files button. */
    openRef: RefObject<(() => void) | null>
}

/**
 * The link drives the same dropzone the table sits inside, so a picked file and a dropped one take
 * one path — including the size check and the duplicate prompt.
 */
export const AlreadyHaveCodeSection: FC<AlreadyHaveCodeSectionProps> = ({ isVisible = true, openRef }) => {
    if (!isVisible) return null

    return (
        <Stack gap="xxs" data-testid="already-have-code">
            <Title order={4} fz="md" c={semanticColor('text.primary')}>
                {SECTION_TITLE}
            </Title>
            <Text size="sm" c={semanticColor('text.primary')}>
                Download the template file from the table above. Add your code, then edit and test it in the
                SafeInsights IDE against example data.{' '}
                <Anchor component="button" type="button" size="sm" onClick={() => openRef.current?.()}>
                    {UPLOAD_LINK_TEXT}
                </Anchor>{' '}
                when you are ready. {LIMITS_TEXT}
            </Text>
        </Stack>
    )
}
