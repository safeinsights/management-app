'use client'

import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Anchor, Checkbox, Popover, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { FC, ReactNode } from 'react'
import type { PublicLegalDocument } from './acknowledgement-copy'
import { LegalDocumentSections } from './document-sections'

// Stand-ins for the period before the first Terms of Service and Privacy Notice are published.
const TOS_TEXT =
    'What to expect: Once implemented, SafeInsights Terms of Service will detail acceptable use of SafeInsights, applicable laws and jurisdictions, procedures for resolving disputes, and disclaimers of liability.'

const PRIVACY_TEXT =
    'What to expect: Once implemented, SafeInsights Privacy Notice will detail the ways that SafeInsights gathers, uses, discloses, and manages user data and personal information.'

const PopoverLink: FC<{ label: string; content: string }> = ({ label, content }) => {
    const [opened, { toggle, close }] = useDisclosure(false)

    return (
        <Popover width={300} withArrow shadow="md" opened={opened} onChange={close}>
            <Popover.Target>
                <Anchor component="button" type="button" onClick={toggle} fw={700} fz="sm">
                    {label}
                </Anchor>
            </Popover.Target>
            <Popover.Dropdown>
                <Text size="sm">{content}</Text>
            </Popover.Dropdown>
        </Popover>
    )
}

export const TermsCheckboxLabel: FC = () => (
    <Text component="span" fz="sm">
        I agree to the <PopoverLink label="Terms of Service" content={TOS_TEXT} /> and{' '}
        <PopoverLink label="Privacy Notice" content={PRIVACY_TEXT} />
    </Text>
)

const agreementLabel = (documents: PublicLegalDocument[]) =>
    `I agree to the ${documents.map((document) => legalDocumentTypeLabels[document.type]).join(' and ')}`

type TermsCheckboxProps = {
    checked: boolean
    onChange: (checked: boolean) => void
    /** Fires when the box loses focus, so leaving it unchecked can be flagged (OTTER-647). */
    onBlur?: () => void
    error?: ReactNode
    /** Empty before anything is published: no version exists to record an acknowledgement
     * against, so the app-wide gate collects it later. */
    documents?: PublicLegalDocument[]
}

const TERMS_ERROR_ID = 'terms-accepted-error'

// A standalone Mantine `Checkbox` uses `error` for styling only, adding neither `aria-invalid`
// nor `aria-describedby`, so both are wired by hand.
export const TermsCheckbox: FC<TermsCheckboxProps> = ({ checked, onChange, onBlur, error, documents = [] }) => (
    <Stack gap="sm" mt="md">
        <LegalDocumentSections documents={documents} labelSize="sm" />
        <Checkbox
            checked={checked}
            onChange={(event) => onChange(event.currentTarget.checked)}
            onBlur={onBlur}
            label={documents.length ? agreementLabel(documents) : <TermsCheckboxLabel />}
            // A standalone Checkbox accepts no `errorProps`; a span because Mantine renders the
            // error inside a `<p>`.
            error={error ? <span id={TERMS_ERROR_ID}>{error}</span> : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? TERMS_ERROR_ID : undefined}
        />
    </Stack>
)
