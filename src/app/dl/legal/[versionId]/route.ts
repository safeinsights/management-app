import { NextResponse } from 'next/server'
import { db } from '@/database'
import { canDownloadLegalDocument } from '@/server/auth'
import { legalDocumentVersionForDownload } from '@/server/db/legal-document'
import { urlForLegalDocumentVersion } from '@/server/legal-document'

export const GET = async (_: Request, { params }: { params: Promise<{ versionId: string }> }) => {
    const { versionId } = await params

    const version = await legalDocumentVersionForDownload(db, versionId)

    // 401 for an unknown id too, so a probe cannot tell a missing version from a forbidden one.
    if (!version || !(await canDownloadLegalDocument(version))) {
        return NextResponse.json({ error: 'permission denied' }, { status: 401 })
    }

    return NextResponse.redirect(await urlForLegalDocumentVersion(version))
}
