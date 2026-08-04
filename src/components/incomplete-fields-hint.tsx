import { type FC } from 'react'
import { Text } from '@mantine/core'

/**
 * Names what is still missing next to a disabled submit button.
 *
 * Blur validation (OTTER-647) highlights a required field as soon as the user leaves it
 * incomplete, but a field never visited stays clean, so the button can still be disabled for
 * reasons nothing on screen explains. This closes that gap without re-enabling the button,
 * which OTTER-557 deliberately gates.
 *
 * Mirrors `submitDisabledReason` in the code upload footer, previously the only place in the
 * app that explained a disabled submit.
 */
export interface IncompleteFieldsHintProps {
    /** Labels of the required fields still outstanding. Empty renders nothing. */
    missing: string[]
}

const formatMissing = (missing: string[]) => {
    if (missing.length === 1) return `${missing[0]} is required before submitting.`
    const last = missing[missing.length - 1]
    return `${missing.slice(0, -1).join(', ')} and ${last} are required before submitting.`
}

export const IncompleteFieldsHint: FC<IncompleteFieldsHintProps> = ({ missing }) => {
    if (missing.length === 0) return null

    return (
        <Text size="sm" c="charcoal.7" ta="right" role="status" data-testid="incomplete-fields-hint">
            {formatMissing(missing)}
        </Text>
    )
}
