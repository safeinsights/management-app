import { NextResponse } from 'next/server'
import { db } from '@/database'
import { requireQaAdmin, deleteStudyById } from '@/server/qa-cleanup'
import { qaErrorResponse } from '../../responses'
import { auditQaInvocation } from '../../audit'

export const DELETE = async (_req: Request, { params }: { params: Promise<{ studyId: string }> }) => {
    const auth = await requireQaAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { studyId } = await params
    try {
        await deleteStudyById(db, studyId)
    } catch (error) {
        return qaErrorResponse(error)
    }

    await auditQaInvocation({
        actorUserId: auth.user.id,
        eventType: 'DELETED',
        recordType: 'STUDY',
        recordId: studyId,
    })

    return NextResponse.json({ deleted: studyId })
}
