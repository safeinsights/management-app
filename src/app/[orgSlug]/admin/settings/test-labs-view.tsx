'use client'

import type { ReactNode } from 'react'
import { Text } from '@mantine/core'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'
import { SettingsCard, SettingsCardRow } from './settings-card'

// Presentational only, so the section renders without a QueryClient (e.g. Ladle).

const DESCRIPTION = `For all studies in Research Labs that are marked as Test Labs, ${legalDocumentCollectionLabels.SLA} will not be created.`

// No actions column: a test lab cannot be removed yet. designateTestLabs states what removal needs.
export function TestLabRowView({ name }: { name: string }) {
    return (
        <SettingsCardRow>
            <Text fw={500} p="sm">
                {name}
            </Text>
        </SettingsCardRow>
    )
}

export type TestLabsViewProps = {
    onAdd: () => void
    children: ReactNode
}

export function TestLabsView({ onAdd, children }: TestLabsViewProps) {
    return (
        <SettingsCard title="Test Labs" addLabel="Add" onAdd={onAdd} description={DESCRIPTION}>
            {children}
        </SettingsCard>
    )
}
