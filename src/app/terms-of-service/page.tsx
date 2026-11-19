import type { Metadata } from 'next'
import { PublicGlobalDocument } from '@/components/legal/public-global-document'

export const metadata: Metadata = { title: 'Terms of Service' }

export default function TermsOfServicePage() {
    return <PublicGlobalDocument type="TOS" />
}
