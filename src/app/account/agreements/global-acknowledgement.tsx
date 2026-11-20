'use client'

import { Button, Checkbox, Group, Paper, Stack, Text, Title, VisuallyHidden } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import type { FC } from 'react'
import { AcknowledgementError } from '@/components/legal/blocking-modal'
import { useAcknowledgementConsent } from '@/components/legal/use-acknowledgement-consent'
import { globalDocumentRoute } from '@/components/legal/global-document-route'
import { LinkWithIcon } from '@/components/links'
import { legalDocumentTypeLabels, type PendingGlobalAcknowledgement } from '@/schema/legal-document'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { queryKeys } from '@/lib/query-keys'

type Props = {
    documents: PendingGlobalAcknowledgement[]
    isChecked: boolean
    onCheckedChange: (checked: boolean) => void
    onContinue: () => void
    isSubmitting: boolean
    error: string | null
}

const documentNames = (documents: PendingGlobalAcknowledgement[]) =>
    documents.map((document) => legalDocumentTypeLabels[document.type]).join(' and ')

// "Updated" only when it is true of every document asked about; a first publish keeps the older
// "now available" wording.
const isUpdateOfAll = (documents: PendingGlobalAcknowledgement[]) => documents.every((document) => document.isUpdate)

// A new tab, so reading the document does not lose the gate the user is answering.
const DocumentLink: FC<{ document: PendingGlobalAcknowledgement }> = ({ document }) => (
    <LinkWithIcon
        href={globalDocumentRoute(document.type)}
        target="_blank"
        rel="noopener"
        fz="md"
        underline="always"
        icon={<ArrowSquareOutIcon size={16} />}
    >
        {legalDocumentTypeLabels[document.type]}
        <VisuallyHidden component="span"> (opens in a new tab)</VisuallyHidden>
    </LinkWithIcon>
)

const DocumentLinks: FC<{ documents: PendingGlobalAcknowledgement[] }> = ({ documents }) =>
    documents.map((document, index) => (
        <span key={document.versionId}>
            {index > 0 ? ' and ' : null}
            <DocumentLink document={document} />
        </span>
    ))

const globalAcknowledgementBody = (documents: PendingGlobalAcknowledgement[]) => {
    const links = <DocumentLinks documents={documents} />
    if (isUpdateOfAll(documents)) return <>We have updated our {links}. Please review before proceeding.</>

    const verb = documents.length > 1 ? 'are' : 'is'
    return (
        <>
            The {links} {verb} now available. Please review before proceeding.
        </>
    )
}

const globalAcknowledgementCheckboxLabel = (documents: PendingGlobalAcknowledgement[]) => {
    const updated = isUpdateOfAll(documents) ? 'updated ' : ''

    return `I have read and agree to the ${updated}${documentNames(documents)}.`
}

// The Terms of Service and Privacy Notice gate. It asks once for every outstanding one and links to
// each rather than embedding it. No Sign out, per the UX review.
export const GlobalAcknowledgement: FC<Props> = ({
    documents,
    isChecked,
    onCheckedChange,
    onContinue,
    isSubmitting,
    error,
}) => (
    <Paper bg={semanticColor('surface.raised')} p="xxl" radius="sm" maw={511} my={{ base: 'md', lg: 0 }}>
        <Stack>
            <Title order={1} fz="h3">
                Welcome to SafeInsights!
            </Title>

            <Text fz="md">{globalAcknowledgementBody(documents)}</Text>

            <Checkbox
                checked={isChecked}
                onChange={(event) => onCheckedChange(event.currentTarget.checked)}
                label={
                    <Text span fz="sm" fw={fontWeight.semibold}>
                        {globalAcknowledgementCheckboxLabel(documents)}
                    </Text>
                }
            />

            <AcknowledgementError error={error} />

            <Group>
                {/* Mantine's `loading` blocks pointer clicks but leaves the button keyboard-focusable. */}
                <Button onClick={onContinue} disabled={!isChecked || isSubmitting} loading={isSubmitting}>
                    Continue
                </Button>
            </Group>
        </Stack>
    </Paper>
)

// Replace, not push: Back should not return to a step that has just been answered.
const useGlobalAcknowledgementStep = (documents: PendingGlobalAcknowledgement[], destination: Route) => {
    const router = useRouter()

    return useAcknowledgementConsent({
        versionIds: documents.map((document) => document.versionId),
        invalidateKey: queryKeys.legal.nextPendingAcknowledgement(),
        onAcknowledged: () => router.replace(destination),
    })
}

export const GlobalAcknowledgementStep: FC<{ documents: PendingGlobalAcknowledgement[]; destination: Route }> = ({
    documents,
    destination,
}) => <GlobalAcknowledgement documents={documents} {...useGlobalAcknowledgementStep(documents, destination)} />
