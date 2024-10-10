export const dynamic = 'force-dynamic' // defaults to auto
import { db, sql } from '@/database'

export async function GET(_: Request, { params: { memberIdentifier } }: { params: { memberIdentifier: string } }) {
    const member = await db
        .selectFrom('member')
        .select('id')
        .where('identifier', '=', memberIdentifier)
        .executeTakeFirstOrThrow()

    const runs = await db
        .selectFrom('studyRun')
        .innerJoin('study', (join) => join.on('memberId', '=', member.id).onRef('study.id', '=', 'studyRun.studyId'))

        //'study_run.id', 'study.id')
        .select([
            'studyRun.id as runId',
            'studyId',
            'studyRun.createdAt as requestedAt',
            'study.title',
            'studyRun.status',
            'study.dataSources',
            'study.outputFormat',
            sql<string>`concat(study.container_location, ':', uuid_to_b64(study_run.id) )`.as('containerLocation'),
        ])
        //        .where('study_run.status', '=', 'approved') // FIXME, add back once approval steps are complete
        .where('study.memberId', '=', member.id)
        .execute()

    return Response.json(runs)
}

//docker push 905418271997.dkr.ecr.us-east-1.amazonaws.com/si/analysis/openstax/AZJ3DFJ6cR2R_bKdQf-Bhw/a-test-study:AZJ3DFKJddOIRT5T3NjS5g
