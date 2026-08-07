'use client'

import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Anchor, Checkbox, Popover, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { FC, ReactNode } from 'react'
import type { PublicLegalDocument } from './acknowledgement-copy'
import { LegalDocumentContent } from './document-content'

// Stand-ins for the period before the first Terms of Service and Privacy Notice are published. Once
// they exist the real documents render below and the acknowledgement is recorded against them.
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

const PublishedDocuments: FC<{ documents: PublicLegalDocument[] }> = ({ documents }) => (
    <Stack gap="md">
        {documents.map((document) => (
            <Stack key={document.versionId} gap="xs">
                <Text fw={600} fz="sm">
                    {legalDocumentTypeLabels[document.type]}
                </Text>
                <LegalDocumentContent content={document.content} label={legalDocumentTypeLabels[document.type]} />
            </Stack>
        ))}
    </Stack>
)

const agreementLabel = (documents: PublicLegalDocument[]) =>
    `I agree to the ${documents.map((document) => legalDocumentTypeLabels[document.type]).join(' and ')}`

type TermsCheckboxProps = {
    checked: boolean
    onChange: (checked: boolean) => void
    /** Fires when the box loses focus, so leaving it unchecked can be flagged (OTTER-647). */
    onBlur?: () => void
    error?: ReactNode
    /**
     * Published documents to display and agree to. Empty before anything is published, in which case
     * the placeholder copy stands in and no acknowledgement is recorded — there is no version to
     * record one against. The app-wide gate then collects it once a real document exists.
     */
    documents?: PublicLegalDocument[]
}

const TERMS_ERROR_ID = 'terms-accepted-error'

// A standalone Mantine `Checkbox` uses `error` for styling only: it renders the message but adds
// neither `aria-invalid` nor `aria-describedby`, unlike the inputs built on `Input.Wrapper`. Both
// are wired by hand here so the requirement is not conveyed by red text alone.
export const TermsCheckbox: FC<TermsCheckboxProps> = ({ checked, onChange, onBlur, error, documents = [] }) => (
    <Stack gap="sm" mt="md">
        <PublishedDocuments documents={documents} />
        <Checkbox
            checked={checked}
            onChange={(event) => onChange(event.currentTarget.checked)}
            onBlur={onBlur}
            label={documents.length ? agreementLabel(documents) : <TermsCheckboxLabel />}
            // The id rides on this span rather than an `errorProps`, which a standalone Checkbox does
            // not accept. A span, because Mantine renders the error inside a `<p>`.
            error={error ? <span id={TERMS_ERROR_ID}>{error}</span> : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? TERMS_ERROR_ID : undefined}
        />
    </Stack>
)
