import type { Metadata } from 'next'
import UserStudiesDashboard from './user-studies'

export const metadata: Metadata = { title: 'My studies' }

export default function UserStudiesDashboardPage() {
    return <UserStudiesDashboard />
}
