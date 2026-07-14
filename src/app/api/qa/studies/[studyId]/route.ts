import { NextResponse } from 'next/server'
import { db } from '@/database'
import { requireQaAdmin, deleteStudyById, QaCleanupNotFoundError } from '@/server/qa-cleanup'

export const DELETE = async (_req: Request, { params }: { params: Promise<{ studyId: string }> }) => {
    const auth = await requireQaAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { studyId } = await params
    try {
        await deleteStudyById(db, studyId)
    } catch (error) {
        if (error instanceof QaCleanupNotFoundError) {
            return NextResponse.json({ error: error.message }, { status: 404 })
        }
        throw error
    }

    return NextResponse.json({ deleted: studyId })
}
