import type { LegalDocumentFormat, LegalDocumentType } from '@/database/types'
import { legalDocumentFormats, type LegalDocumentBody } from '@/schema/legal-document'
import { signedUrlForFile } from '@/server/aws'
import { fetchFileContents } from '@/server/storage'

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

const contentOf = async (filePath: string) => await (await fetchFileContents(filePath)).text()

// A pdf gets a signed url, markdown gets inlined content. fileName only rides the pdf branch, where
// it names the download (the S3 key is a bare uuid).
export const bodyForVersion = async ({
    type,
    filePath,
    fileName,
}: {
    type: LegalDocumentType
    filePath: string
    fileName: string
}): Promise<LegalDocumentBody> =>
    legalDocumentFormats[type] === 'pdf'
        ? { format: 'pdf', url: await urlForLegalDocumentVersion({ filePath, fileName, format: 'pdf' }) }
        : { format: 'markdown', content: await contentOf(filePath) }
