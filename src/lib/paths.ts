import type { MinimalRunInfo, MinimalRunResultsInfo } from '@/lib/types'
import { uuidToB64 } from './uuid'
// // https://dense13.com/blog/2009/05/03/converting-string-to-slug-javascript/
export function slugify(str: string) {
    str = str.replace(/^\s+|\s+$/g, '') // trim
    str = str.toLowerCase()

    // remove accents, swap ñ for n, etc
    var from = 'àáäâèéëêìíïîòóöôùúüûñç·/_,:;'
    var to = 'aaaaeeeeiiiioooouuuunc------'
    for (var i = 0, l = from.length; i < l; i++) {
        str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i))
    }

    str = str
        .replace(/[^a-z0-9 -]/g, '') // remove invalid chars
        .replace(/\s+/g, '-') // collapse whitespace and replace by -
        .replace(/-+/g, '-') // collapse dashes

    return str.slice(0, 50)
}

export const pathForStudyRun = (parts: MinimalRunInfo) =>
    `analysis/${parts.memberIdentifier}/${parts.studyId}/${parts.studyRunId}`

export const pathForStudyRunCode = (parts: MinimalRunInfo) =>
    `${pathForStudyRun(parts)}/code`

export const pathForStudyRunResults = (parts: MinimalRunResultsInfo) =>
    `${pathForStudyRun(parts)}/results/${parts.resultsPath}`

export const resultsDownloadURL = (run: { id: string; resultsPath: string }) =>
    `/dl/results/${uuidToB64(run.id)}/${run.resultsPath}`
