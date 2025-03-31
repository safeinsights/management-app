import { NextResponse } from 'next/server'
import { db } from '@/database'
import { retrieveStudyDocumentFile } from '@/server/storage'
import { StudyDocumentType } from '@/lib/types'
import { MinimalStudyInfo } from '@/lib/types'
import path from 'path'

export const GET = async (
    _: Request,
    {
        params,
    }: {
        params: {
            memberIdentifier: string
            studyId: string
            path: string[]
        }
    },
) => {
    const { memberIdentifier, studyId, path: docPath } = params

    // Reconstruct the full document path
    const fullDocPath = docPath.join('/')

    try {
        // Verify study exists and belongs to the member
        const study = await db
            .selectFrom('study')
            .innerJoin('member', 'study.memberId', 'member.id')
            .select([
                'study.descriptionDocPath',
                'study.irbDocPath',
                'study.agreementDocPath',
                'member.identifier as memberIdentifier',
            ])
            .where('study.id', '=', studyId)
            .where('member.identifier', '=', memberIdentifier)
            .executeTakeFirst()

        if (!study) {
            return NextResponse.json({ error: 'Study not found' }, { status: 404 })
        }

        // Determine document type
        let documentType: StudyDocumentType | undefined
        if (fullDocPath === study.descriptionDocPath) {
            documentType = StudyDocumentType.DESCRIPTION
        } else if (fullDocPath === study.irbDocPath) {
            documentType = StudyDocumentType.IRB
        } else if (fullDocPath === study.agreementDocPath) {
            documentType = StudyDocumentType.AGREEMENT
        }

        // Validate document path
        if (!documentType) {
            return NextResponse.json({ error: 'Invalid document path' }, { status: 403 })
        }

        const validPaths = [study.descriptionDocPath, study.irbDocPath, study.agreementDocPath].filter(Boolean)

        if (!validPaths.includes(fullDocPath)) {
            return NextResponse.json({ error: 'Invalid document path' }, { status: 403 })
        }

        const studyInfo: MinimalStudyInfo = {
            memberIdentifier,
            studyId,
        }

        // Retrieve document from storage
        const documentContent = await retrieveStudyDocumentFile(studyInfo, documentType, fullDocPath)

        // Ensure the response is treated as a download
        const filename = path.basename(fullDocPath)
        return new NextResponse(documentContent.body, {
            headers: {
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Type': 'application/octet-stream',
            },
        })
    } catch (error) {
        console.error('Document download error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
