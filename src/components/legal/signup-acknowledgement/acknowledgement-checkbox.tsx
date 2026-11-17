'use client'

import {
    type GlobalLegalDocument,
    type GlobalLegalDocumentType,
    globalLegalDocumentTypes,
    legalDocumentTypeLabels,
} from '@/schema/legal-document'
import { Anchor } from '@mantine/core'
import type { FC, ReactNode } from 'react'
import { ParticipationData } from '@/server/actions/participation-agreement.actions'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { globalDocumentRoute } from '../global-document-route'

// A new tab, so reading a document does not lose the half-filled form.
const AgreementLink: FC<{ href: string; children: ReactNode }> = ({ href, children }) => (
    <Anchor
        href={href}
        target="_blank"
        rel="noreferrer"
        c={semanticColor('link.default')}
        fz="sm"
        fw={fontWeight.bold}
        underline="always"
    >
        {children}
    </Anchor>
)

const GlobalDocumentLink: FC<{ type: GlobalLegalDocumentType; index: number }> = ({ type, index }) => {
    const separator = index > 0 ? ' and ' : null

    return (
        <>
            {separator}
            <AgreementLink href={globalDocumentRoute(type)}>{legalDocumentTypeLabels[type]}</AgreementLink>
        </>
    )
}

// With nothing published the label still names both, and each link opens that page's empty state.
const agreedTypes = (documents: GlobalLegalDocument[]): readonly GlobalLegalDocumentType[] =>
    documents.length ? documents.map((document) => document.type) : globalLegalDocumentTypes

export const globalDocAgreementLabel = (documents: GlobalLegalDocument[]) => (
    <>
        I agree to the{' '}
        {agreedTypes(documents).map((type, index) => (
            <GlobalDocumentLink key={type} type={type} index={index} />
        ))}
        .
    </>
)

export const participationAgreementLabel = (document: ParticipationData | null) => {
    if (!document) return null
    return (
        <>
            I agree to the{' '}
            {/* Not PdfLink: its label never wraps, which pushes the form past a phone's width (OTTER-951). */}
            <AgreementLink href={document.url}>{legalDocumentTypeLabels[document.type]}</AgreementLink>.
        </>
    )
}
