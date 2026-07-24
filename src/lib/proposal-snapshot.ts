import { z } from 'zod'

// OTTER-636: the single validated shape of an immutable submitted-proposal snapshot. Every write to and
// read from `study_proposal_submission.snapshot` goes through this schema + the serializer below — do
// NOT hand-build partial snapshot objects in individual actions. It captures every reviewer-visible
// proposal field (the funnel is getStudyAction -> ProposalRequest, plus the AI review agent), so a
// reviewer never has to read the mutable `study` row or live Yjs docs.
export const PROPOSAL_SNAPSHOT_SCHEMA_VERSION = 1

export const proposalSnapshotSchema = z.object({
    title: z.string().nullable(),
    piName: z.string(),
    piUserId: z.string().nullable(),
    language: z.enum(['R', 'PYTHON']),
    datasets: z.array(z.string()).nullable(),
    dataSources: z.array(z.string()),
    // Lexical JSON bodies are opaque here; they are validated by the editor/form layer on the way in.
    researchQuestions: z.unknown().nullable(),
    projectSummary: z.unknown().nullable(),
    impact: z.unknown().nullable(),
    additionalNotes: z.unknown().nullable(),
    irbProtocols: z.string().nullable(),
    descriptionDocPath: z.string().nullable(),
    irbDocPath: z.string().nullable(),
    agreementDocPath: z.string().nullable(),
})

export type ProposalSnapshot = z.infer<typeof proposalSnapshotSchema>

// The canonical proposal columns as read off a `study` row (Kysely selects them as these types).
export type ProposalSnapshotSource = {
    title: string | null
    piName: string
    piUserId: string | null
    language: 'R' | 'PYTHON'
    datasets: string[] | null
    dataSources: string[]
    researchQuestions: unknown
    projectSummary: unknown
    impact: unknown
    additionalNotes: unknown
    irbProtocols: string | null
    descriptionDocPath: string | null
    irbDocPath: string | null
    agreementDocPath: string | null
}

// Build the validated snapshot object from a study row's canonical proposal columns. Callers persist the
// returned object as-is into `study_proposal_submission.snapshot`.
export function serializeProposalSnapshot(source: ProposalSnapshotSource): ProposalSnapshot {
    return proposalSnapshotSchema.parse({
        title: source.title,
        piName: source.piName,
        piUserId: source.piUserId,
        language: source.language,
        datasets: source.datasets,
        dataSources: source.dataSources ?? [],
        researchQuestions: source.researchQuestions ?? null,
        projectSummary: source.projectSummary ?? null,
        impact: source.impact ?? null,
        additionalNotes: source.additionalNotes ?? null,
        irbProtocols: source.irbProtocols,
        descriptionDocPath: source.descriptionDocPath,
        irbDocPath: source.irbDocPath,
        agreementDocPath: source.agreementDocPath,
    })
}

// Validate a stored jsonb snapshot back into a typed ProposalSnapshot. Reviewer loaders use this so a
// malformed/legacy row fails loudly rather than rendering partial data.
export function parseProposalSnapshot(raw: unknown): ProposalSnapshot {
    return proposalSnapshotSchema.parse(raw)
}
