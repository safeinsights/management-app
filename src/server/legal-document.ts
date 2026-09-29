import type { LegalDocumentFormat } from '@/database/types'
import { signedUrlForFile } from '@/server/aws'

const legalDocumentMimeTypes: Record<LegalDocumentFormat, string> = {
    pdf: 'application/pdf',
    markdown: 'text/markdown; charset=utf-8',
}

// Both overrides are load-bearing: the presigned POST leaves the object as octet-stream, and the
// key is a bare versionId, so the download would be named after a uuid with no extension.
export const urlForLegalDocumentVersion = ({
    filePath,
    fileName,
    format,
}: {
    filePath: string
    fileName: string
    format: LegalDocumentFormat
}) =>
    signedUrlForFile(filePath, {
        ResponseContentType: legalDocumentMimeTypes[format],
        // S3 echoes this into the response header verbatim.
        ResponseContentDisposition: `inline; filename="${fileName.replace(/[\r\n]+/g, ' ').replace(/["\\]/g, '_')}"`,
    })
