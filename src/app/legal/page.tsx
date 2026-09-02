import { UserLegalView } from './user-legal-view'
import { UserLegalTabs } from './user-legal-tabs'

export default async function LegalPage() {
    return <UserLegalView tabs={<UserLegalTabs />} />
}
