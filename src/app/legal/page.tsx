import { LegalPageShell } from '@/components/legal/legal-page-shell'
import { UserLegalTabs } from './user-legal-tabs'

export default function LegalPage() {
    return <LegalPageShell title="Legal" tabs={<UserLegalTabs />} />
}
