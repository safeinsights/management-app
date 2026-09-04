import { describe, expect, it, vi } from 'vitest'
import { signedUrlForFile } from '@/server/aws'
import { urlForLegalDocumentVersion } from './legal-document'

vi.mock('@/server/aws', () => ({ signedUrlForFile: vi.fn(async () => 'https://signed.example/file') }))

describe('urlForLegalDocumentVersion', () => {
    it('serves a pdf inline under its stored name, not its uuid key', async () => {
        await urlForLegalDocumentVersion({ filePath: 'legal/SLA/doc/v1', fileName: 'agreement.pdf', format: 'pdf' })

        expect(vi.mocked(signedUrlForFile)).toHaveBeenCalledWith('legal/SLA/doc/v1', {
            ResponseContentType: 'application/pdf',
            ResponseContentDisposition: 'inline; filename="agreement.pdf"',
        })
    })

    it('carries the markdown type for a global document', async () => {
        await urlForLegalDocumentVersion({ filePath: 'legal/TOS/doc/v1', fileName: 'terms.md', format: 'markdown' })

        expect(vi.mocked(signedUrlForFile)).toHaveBeenCalledWith(
            'legal/TOS/doc/v1',
            expect.objectContaining({ ResponseContentType: 'text/markdown; charset=utf-8' }),
        )
    })

    // S3 echoes the disposition back verbatim, so a quote or newline in the name would break out.
    it('neutralises a file name that would break out of the header', async () => {
        await urlForLegalDocumentVersion({
            filePath: 'legal/SLA/doc/v1',
            fileName: 'ev"il\nname.pdf',
            format: 'pdf',
        })

        expect(vi.mocked(signedUrlForFile)).toHaveBeenCalledWith(
            'legal/SLA/doc/v1',
            expect.objectContaining({ ResponseContentDisposition: 'inline; filename="ev_il name.pdf"' }),
        )
    })
})
