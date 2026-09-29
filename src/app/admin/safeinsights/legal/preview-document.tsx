'use client'

import { useQuery } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { LegalMarkdownContent } from '@/components/legal/markdown-content'
import { LoadingMessage } from '@/components/loading'
import { actionResult } from '@/lib/utils'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import { fetchLegalDocumentContentAction } from '@/server/actions/legal-document.actions'

// A signed URL to a .md opens as raw source or a download, so render the content here instead.
export function PreviewDocument({ versionId, label }: { versionId: string; label: string }) {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: legalDocumentQueryKeys.documentContent(versionId),
        staleTime: Infinity,
        queryFn: async () => actionResult(await fetchLegalDocumentContentAction({ versionId })).content,
    })

    if (isLoading) return <LoadingMessage message="Loading..." />
    if (isError || !data) return <ErrorAlert error={error ?? 'The document could not be loaded'} color="red" />
    return <LegalMarkdownContent content={data} label={label} />
}
