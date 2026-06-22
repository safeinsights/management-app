import { describe, expect, it } from 'vitest'
import type { RawJob, RawStudyState } from './state.types'
import { projectStudyState } from './state'

// Deterministic permutations (no Math.random — unavailable and would break reproducibility).
function permutations<T>(arr: readonly T[]): T[][] {
    if (arr.length <= 1) return [arr.slice()]
    const out: T[][] = []
    arr.forEach((x, i) => {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
        for (const p of permutations(rest)) out.push([x, ...p])
    })
    return out
}

const job = (id: string, statuses: string[]): RawJob => ({
    id,
    statusChanges: statuses.map((status) => ({ status: status as RawJob['statusChanges'][number]['status'] })),
    files: [],
})

const base = (jobs: RawJob[]): RawStudyState => ({
    status: 'APPROVED',
    approvedAt: null,
    rejectedAt: null,
    researcherAgreementsAckedAt: null,
    reviewerAgreementsAckedAt: null,
    language: 'R',
    proposalResubmissionNoteDraft: null,
    codeResubmissionNoteDraft: null,
    jobs,
})

const ID1 = '019000000000-0000-0000-0000-000000000001'
const ID2 = '019000000000-0000-0000-0000-000000000002'

describe('projectStudyState order-independence', () => {
    const fixtures: Record<string, RawJob[]> = {
        lateScanAfterApproval: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'CODE-SCANNED'])],
        resultsAlongsideSibling: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'FILES-APPROVED', 'CODE-SCANNED'])],
        resubmissionTwoRounds: [job(ID1, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED']), job(ID2, ['CODE-SUBMITTED'])],
    }

    for (const [name, jobs] of Object.entries(fixtures)) {
        it(`${name}: identical under status+job permutation`, () => {
            const expected = projectStudyState(base(jobs))
            // Permute each job's statusChanges AND the jobs array; every combination must match.
            const jobStatusPerms = jobs.map((j) => permutations(j.statusChanges))
            for (const jobOrder of permutations(jobs.map((_, i) => i))) {
                for (const pick of cartesian(jobStatusPerms)) {
                    const shuffled = jobOrder.map((ji) => ({ ...jobs[ji], statusChanges: pick[ji] }))
                    expect(projectStudyState(base(shuffled))).toEqual(expected)
                }
            }
        })
    }
})

function cartesian<T>(arrays: T[][]): T[][] {
    return arrays.reduce<T[][]>((acc, cur) => acc.flatMap((a) => cur.map((c) => [...a, c])), [[]])
}
