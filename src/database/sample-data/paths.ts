// Copies of @/lib/paths: that module imports @/lib/utils, which pulls @sentry/nextjs into the
// migrator bundle. paths.test.ts keeps them equal.
export type JobPathInfo = { orgSlug: string; studyId: string; studyJobId: string }

export const studyJobPath = (p: JobPathInfo) => `studies/${p.orgSlug}/${p.studyId}/jobs/${p.studyJobId}`
export const codeFilePath = (p: JobPathInfo, fileName: string) => `${studyJobPath(p)}/code/${fileName}`
export const resultsFilePath = (p: JobPathInfo, fileName: string) => `${studyJobPath(p)}/results/${fileName}`
export const agreementPath = (p: { legalDocumentId: string; versionId: string }) =>
    `legal/SLA/${p.legalDocumentId}/${p.versionId}`
