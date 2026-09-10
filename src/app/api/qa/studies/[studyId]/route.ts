import { NextResponse } from 'next/server'
import { db } from '@/database'
import { requireQaAuth, requireAdminOfOrgs, findQaStudy, deleteStudyCompletely } from '@/server/qa-cleanup'
import { qaErrorResponse } from '../../responses'
import { auditQaOperation } from '../../audit'

export const DELETE = async (_req: Request, { params }: { params: Promise<{ studyId: string }> }) => {
    const auth = await requireQaAuth()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { studyId } = await params
    try {
        // Resolved first so a 404/non-QA target is rejected before an attempt is audited.
        const study = await findQaStudy(db, studyId)

        // A study belongs to exactly one org, so that org is the whole blast radius.
        const authorized = await requireAdminOfOrgs(db, auth, [study.orgSlug])
        if (!authorized.ok) {
            return NextResponse.json({ error: authorized.message }, { status: authorized.status })
        }

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
