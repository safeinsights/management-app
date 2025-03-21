import { NextRequest, NextResponse } from 'next/server'
import { deleteStudyAndFiles } from '@/server/actions/study-actions'

export async function DELETE(request: NextRequest) {
    try {
        const { studyId, deleteType } = await request.json()
        
        // Validate input
        if (!studyId) {
            return NextResponse.json({ error: 'Study ID is required' }, { status: 400 })
        }

        // The deleteStudyAndFiles function already handles all deletion logic
        const result = await deleteStudyAndFiles(studyId)

        return NextResponse.json(result, { status: 200 })
    } catch (error) {
        console.error('Error deleting study:', error)
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Failed to delete study' 
        }, { status: 500 })
    }
}