import type { FC } from 'react'
import { Text } from '@mantine/core'

/**
 * Shared by the FAQ's "What is the main file template?" answer and the Template badge's hover card,
 * which the card gives identical copy. One definition so a revision to either lands on both.
 *
 * A fragment rather than its own Text: the caller owns the size, since the FAQ and the hover card
 * set it differently.
 */
export const MainFileTemplateCopy: FC<{ dataPartnerName: string }> = ({ dataPartnerName }) => (
    <>
        It is a template from {dataPartnerName} that connects to their dataset. You’ll see it listed below, and it’s
        pre-loaded as your starting point when you click{' '}
        <Text span inherit fw={600}>
            Launch IDE.
        </Text>{' '}
        Leave the fixed setup code unchanged, or your code will not work correctly. The rest is a working example with
        reference notes you can edit or replace with your own code.
    </>
)
