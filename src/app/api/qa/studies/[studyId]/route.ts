import { NextResponse } from 'next/server'
import { requireQaAuth, requireAdminOfOrgs, findQaStudy, deleteStudyCompletely } from '@/server/qa-cleanup'
import { qaErrorResponse, qaRefusedResponse } from '../../responses'
import { auditQaOperation } from '../../audit'
import { currentDb } from '@/server/request-context'

export const DELETE = async (_req: Request, { params }: { params: Promise<{ studyId: string }> }) => {
    const executor = currentDb()
    const auth = await requireQaAuth()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { studyId } = await params
    try {
        // Resolved first so a 404/non-QA target is rejected before an attempt is audited.
        const study = await findQaStudy(executor, studyId)
        const entry = {
            actorUserId: auth.user.id,
            eventType: 'DELETED',
            recordType: 'STUDY',
            recordId: study.studyId,
            metadata: { orgSlugs: study.orgSlugs },
        } as const

        // The study is data of both the enclave that holds it and the lab that submitted it.
        const authorized = await requireAdminOfOrgs(executor, auth, study.orgSlugs)
        if (!authorized.ok) {
            return await qaRefusedResponse(entry, authorized)
        }

        await auditQaOperation(entry, () => deleteStudyCompletely(executor, study.orgSlug, study.studyId))
    } catch (error) {
        return qaErrorResponse(error)
    }

    return NextResponse.json({ deleted: studyId })
}
