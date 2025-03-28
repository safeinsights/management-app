import { NextResponse } from 'next/server'
import { urlOrContentForStudyJobCodeFile, urlOrPathToResultsFile, type UrlOrContent } from '@/server/storage'
import { jobInfoForJobId } from '@/server/db/queries'
import { MinimalJobResultsInfo } from '@/lib/types'

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
    const job = await jobInfoForJobId(jobId)
    return redirectOrDownload(await urlOrContentForStudyJobCodeFile(job, fileName))
}

async function handleResults(jobId: string) {
    if (!jobId) {
        return NextResponse.json({ error: 'no job id provided' }, { status: 400 })
    }
    const job = await jobInfoForJobId(jobId)
    if (!job.resultsPath) return NextResponse.json({ error: 'no job results' }, { status: 400 })

    const info = { ...job, resultsType: 'APPROVED' } as MinimalJobResultsInfo
    const loc = await urlOrPathToResultsFile(info)
    return redirectOrDownload(loc)
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

    if (handlerType == 'results') {
        return await handleResults(...(parts as [string]))
    }

    return NextResponse.json({ error: 'invalid path' }, { status: 400 })
}
