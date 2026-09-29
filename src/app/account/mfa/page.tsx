import type { Metadata } from 'next'
import { ManageMFA } from './manage-mfa'

export const metadata: Metadata = { title: 'Multi-factor authentication' }

export default function ManageMFAPage() {
    return <ManageMFA />
}
