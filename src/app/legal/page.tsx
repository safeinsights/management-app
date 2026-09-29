import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/legal/legal-page-shell'
import { UserLegalTabs } from './user-legal-tabs'

export const metadata: Metadata = { title: 'Legal' }

export default function LegalPage() {
    return <LegalPageShell title="Legal" tabs={<UserLegalTabs />} />
}
