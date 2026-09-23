import type { Metadata } from 'next'
import UserStudiesDashboard from './user-studies'

export const metadata: Metadata = { title: 'My dashboard' }

export default function UserStudiesDashboardPage() {
    return <UserStudiesDashboard />
}
