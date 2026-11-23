import type { Metadata } from 'next'
import { PublicGlobalDocument } from '@/components/legal/public-global-document'

export const metadata: Metadata = { title: 'Privacy Notice' }

export default function PrivacyNoticePage() {
    return <PublicGlobalDocument type="PN" />
}
