import { NextResponse } from 'next/server'
import { db } from '@/database'
import { requireQaAdmin, deleteUserById, QaCleanupNotFoundError } from '@/server/qa-cleanup'

export const DELETE = async (_req: Request, { params }: { params: Promise<{ userId: string }> }) => {
    const auth = await requireQaAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { userId } = await params
    try {
        await deleteUserById(db, userId)
    } catch (error) {
        if (error instanceof QaCleanupNotFoundError) {
            return NextResponse.json({ error: error.message }, { status: 404 })
        }
        throw error
    }

    return NextResponse.json({ deleted: userId })
}
