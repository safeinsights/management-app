import { NextResponse } from 'next/server'
import { db } from '@/database'
import { requireQaAuth, requireAdminOfOrgs, findQaStudy, deleteStudyCompletely } from '@/server/qa-cleanup'
import { qaErrorResponse, qaRefusedResponse } from '../../responses'
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
        const entry = {
            actorUserId: auth.user.id,
            eventType: 'DELETED',
            recordType: 'STUDY',
            recordId: study.studyId,
            metadata: { orgSlugs: study.orgSlugs },
        } as const

        // The study is data of both the enclave that holds it and the lab that submitted it.
        const authorized = await requireAdminOfOrgs(db, auth, study.orgSlugs)
        if (!authorized.ok) {
            return await qaRefusedResponse(entry, authorized)
        }

        await auditQaOperation(entry, () => deleteStudyCompletely(db, study.orgSlug, study.studyId))
    } catch (error) {
        return qaErrorResponse(error)
    }

    return NextResponse.json({ deleted: studyId })
}
