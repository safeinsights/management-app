import { db } from '@/database'
import { NextResponse } from 'next/server'
import { urlOrContentForStudyJobCodeFile, type UrlOrContent } from '@/server/storage'

function redirectOrDownload(loc: UrlOrContent) {
    if (loc.content) {
        return new NextResponse(loc.content)
    } else if (loc.url) {
        return NextResponse.redirect(loc.url)
    }
    return NextResponse.json({ error: 'invalid file' }, { status: 400 })
}

async function handleCode(jobId: string, fileName: string) {
    if (!jobId || !fileName) {
        return NextResponse.json({ error: 'no job id or file name provided' }, { status: 400 })
    }

    const job = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'member.id', 'study.memberId')
        .select(['studyId', 'studyJob.id as studyJobId', 'member.identifier as memberIdentifier'])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirst()
    if (!job) throw new Error(`No job found for job id: ${jobId}`)
    return redirectOrDownload(await urlOrContentForStudyJobCodeFile(job, fileName))
}

export const GET = async (_: Request, { params }: { params: Promise<{ slug: string[] }> }) => {
    const slug = (await params).slug
    if (!slug.length) {
        return NextResponse.json({ error: 'no job id provided' }, { status: 400 })
    }
    const [handlerType, ...parts] = slug

    if (handlerType == 'code') {
        return await handleCode(...(parts as [string, string]))
    }

    return NextResponse.json({ error: 'invalid path' }, { status: 400 })
}
