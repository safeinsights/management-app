import { NextResponse } from 'next/server'
import { checkUserAllowedStudyView, studyInfoForStudyId } from '@/server/db/queries'
import { urlForStudyDocumentFile } from '@/server/storage'
import { StudyDocumentType } from '@/lib/types'

export const GET = async (
    _: Request,
    { params }: { params: Promise<{ studyId: string; fileType: string; fileName: string }> },
) => {
    const { studyId, fileType, fileName } = await params

    const canUserAccessStudy = await checkUserAllowedStudyView(studyId)

    if (!canUserAccessStudy) {
        return NextResponse.json({ error: 'Not authorized to access file' }, { status: 403 })
    }

    if (!studyId || !fileType || !fileName) {
        return NextResponse.json({ error: 'no parameters provided' }, { status: 400 })
    }

    if (!(fileType in StudyDocumentType)) {
        return NextResponse.json({ error: 'invalid filetype for study documents' }, { status: 400 })
    }

    // Verify study exists and belongs to the organization
    const study = await studyInfoForStudyId(studyId)
    if (!study) {
        return NextResponse.json({ error: 'Study not found' }, { status: 400 })
    }

    const url = await urlForStudyDocumentFile(study, fileType as StudyDocumentType, fileName)
    if (url) {
        return NextResponse.redirect(url)
    }

    return NextResponse.json({ error: 'invalid file' }, { status: 400 })
}
