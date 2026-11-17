import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { globalAcknowledgementDestination } from '@/lib/global-acknowledgement-redirect'
import { actionResult } from '@/lib/utils'
import { fetchPendingGlobalAcknowledgementsAction } from '@/server/actions/legal-acknowledgement.actions'
import { GlobalAcknowledgementStep } from './global-acknowledgement'

export const metadata: Metadata = { title: 'Terms of Service and Privacy Notice' }

export const dynamic = 'force-dynamic'

type Props = {
    searchParams: Promise<{ redirect_url?: string }>
}

export default async function AgreementsPage({ searchParams }: Props) {
    const destination = globalAcknowledgementDestination((await searchParams).redirect_url)
    const documents = actionResult(await fetchPendingGlobalAcknowledgementsAction())
    if (!documents.length) redirect(destination)

    return <GlobalAcknowledgementStep documents={documents} destination={destination} />
}
