'use client'

import { useQuery } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { LegalMarkdownContent } from '@/components/legal/markdown-content'
import { LoadingMessage } from '@/components/loading'
import { legalDocumentQueryKeys } from '@/schema/legal-document'

// A signed URL to a .md opens as raw source or a download, so fetch and render it here. Cached
// against the version, not the url, which is re-minted on every read of the versions query.
export function PreviewDocument({ versionId, url, label }: { versionId: string; url: string; label: string }) {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: legalDocumentQueryKeys.documentContent(versionId),
        staleTime: Infinity,
        queryFn: async () => {
            const res = await fetch(url)
            if (!res.ok) throw new Error(`Failed to load document ${res.status}`)
            return res.text()
        },
    })

    if (isLoading) return <LoadingMessage message="Loading..." />
    if (isError || !data) return <ErrorAlert error={error ?? 'The document could not be loaded'} color="red" />
    return <LegalMarkdownContent content={data} label={label} />
}
