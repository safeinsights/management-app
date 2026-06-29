import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

/**
 * Reference documents provided by the reviewing organization.
 * Define the compliance rules and data context for the review.
 */
export interface ReferenceDocs {
    requirements: string
    brcDocs: string
    dataDocs: string
    otherDocs: string
}

/**
 * Primary input for the ReviewAgent.
 * All fields contain pre-loaded content (not file paths or URLs).
 *
 * Mgmt app builds this from:
 * - proposal: composed from Study.projectSummary, .researchQuestions, .impact, .additionalNotes
 * - codeFiles: fetched from S3 via StudyJobFile (MAIN-CODE / SUPPLEMENTAL-CODE)
 * - referenceDocs.dataDocs: fetched from OrgDataSource and corresponding OrgDataSourceUrl entries
 * - referenceDocs.requirements / brcDocs / otherDocs: org-level compliance docs (TBD schema)
 */
export interface ReviewContent {
    proposal: string
    codeFiles: Record<string, string>
    referenceDocs: ReferenceDocs
    researcherTestResults?: string
}

/**
 * Configuration for the ReviewAgent.
 * Supports dependency injection of the Anthropic client for testing.
 *
 * `systemPrompt` is intended to be sourced from the SI Admin page (org-level config).
 * Falls back to the bundled default if omitted.
 *
 * `additionalContext` is appended to the active system prompt rather than replacing it.
 */
export interface ReviewAgentConfig {
    apiKey?: string
    client?: Anthropic
    model?: string
    maxTokens?: number
    systemPrompt?: string
    additionalContext?: string
    analysisPromptTemplate?: string
    maxRetries?: number
}

// Shape is guaranteed at decode time by Anthropic's `strict: true` tool mode
// (see ANALYSIS_TOOL in agent.ts). This schema mirrors that contract for two
// reasons: (1) deriving `AnalysisReport` from one source so the TS type and
// the API contract can't drift; (2) belt-and-suspenders runtime check at the
// write boundary in case of SDK/model regression.
export const analysisReportSchema = z.object({
    proposalSummary: z.string(),
    codeExplanation: z.string(),
    resultsSummary: z.string().optional(),
    alignmentCheck: z.object({
        isAligned: z.boolean(),
        findings: z.array(z.string()),
    }),
    complianceCheck: z.object({
        isCompliant: z.boolean(),
        findings: z.array(z.string()),
    }),
})

/**
 * Structured analysis output from the ReviewAgent.
 */
export type AnalysisReport = z.infer<typeof analysisReportSchema>

/**
 * Single message in a review conversation. Stored alongside the report so
 * future follow-up chats (target: before Oct 2026) can resume by appending
 * a new user turn and calling `continueChat(config, messages, userMessage)`.
 */
export interface ReviewMessage {
    role: 'user' | 'assistant'
    content: string
}

/**
 * Result of `generateAnalysis`. `messages` is the seed conversation
 * (analysis prompt + serialized report) to persist for chat continuation.
 */
export interface AnalysisResult {
    report: AnalysisReport
    messages: ReviewMessage[]
}
