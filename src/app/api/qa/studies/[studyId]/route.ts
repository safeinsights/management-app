import { NextResponse } from 'next/server'
import { db } from '@/database'
import { requireQaAdmin, findQaStudy, deleteStudyCompletely } from '@/server/qa-cleanup'
import { qaErrorResponse } from '../../responses'
import { auditQaOperation } from '../../audit'

export const DELETE = async (_req: Request, { params }: { params: Promise<{ studyId: string }> }) => {
    const auth = await requireQaAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { studyId } = await params
    try {
        // Resolved first so a 404/non-QA target is rejected before an attempt is audited.
        const study = await findQaStudy(db, studyId)

        await auditQaOperation(
            {
                actorUserId: auth.user.id,
                eventType: 'DELETED',
                recordType: 'STUDY',
                recordId: study.studyId,
                metadata: { orgSlug: study.orgSlug },
            },
            () => deleteStudyCompletely(db, study.orgSlug, study.studyId),
        )
    } catch (error) {
        return qaErrorResponse(error)
    }

    return NextResponse.json({ deleted: studyId })
}
