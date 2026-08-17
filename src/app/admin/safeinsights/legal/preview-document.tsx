'use client'

import { useQuery } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { LegalDocumentContent } from '@/components/legal/document-content'
import { LoadingMessage } from '@/components/loading'
import { legalDocumentQueryKeys } from '@/schema/legal-document'

// Markdown documents have no browser viewer: a signed URL to a .md opens as raw source or a
// download, so the file is fetched and rendered here instead of linked. Shared by the upload flow's
// review step and by every read-side link to a tos/pn version.
//
// Cached against the version, never the url: the bytes of a version are immutable, while its signed
// url is re-minted on every read of the versions query.
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
    return <LegalDocumentContent content={data} label={label} />
}
