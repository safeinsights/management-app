import { NextResponse } from 'next/server'
import { studyInfoForStudyId } from '@/server/db/queries'
import { urlForStudyDocumentFile } from '@/server/storage'
import { StudyDocumentType } from '@/lib/types'
import { canViewStudyResults } from '@/server/auth'

export const GET = async (
    _: Request,
    { params }: { params: Promise<{ studyId: string; fileType: string; fileName: string }> },
) => {
    const { studyId, fileType, fileName } = await params
    if (!studyId || !fileType || !fileName) {
        return NextResponse.json({ error: 'no parameters provided' }, { status: 400 })
    }

    const study = await studyInfoForStudyId(studyId)
    if (!study) {
        return NextResponse.json({ error: 'Study not found' }, { status: 400 })
    }

    if (!(await canViewStudyResults(study))) {
        return NextResponse.json({ error: 'permission denied' }, { status: 401 })
    }

    if (!(fileType in StudyDocumentType)) {
        return NextResponse.json({ error: 'invalid filetype for study documents' }, { status: 400 })
    }

    const url = await urlForStudyDocumentFile(study, fileType as StudyDocumentType, fileName)
    if (url) {
        return NextResponse.redirect(url)
    }

    return NextResponse.json({ error: 'invalid file' }, { status: 400 })
}
