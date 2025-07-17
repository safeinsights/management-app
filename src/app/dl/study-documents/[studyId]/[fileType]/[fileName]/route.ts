import { NextResponse } from 'next/server'
import { studyInfoForStudyId } from '@/server/db/queries'
import { urlForStudyDocumentFile } from '@/server/storage'
import { StudyDocumentType } from '@/lib/types'
import { loadSession, subject } from '@/server/session'

export const GET = async (
    _: Request,
    { params }: { params: Promise<{ studyId: string; fileType: string; fileName: string }> },
) => {
    const { studyId, fileType, fileName } = await params

    const study = await studyInfoForStudyId(studyId)

    const session = await loadSession()
    if (study && !session?.can('read', subject('Study', { study }))) {
        return NextResponse.json({ error: 'permission denied' }, { status: 401 })
    }

    if (!study) {
        return NextResponse.json({ error: 'Study not found' }, { status: 400 })
    }

    if (!studyId || !fileType || !fileName) {
        return NextResponse.json({ error: 'no parameters provided' }, { status: 400 })
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
