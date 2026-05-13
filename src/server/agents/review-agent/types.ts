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
 */
export interface ReviewAgentConfig {
    apiKey?: string
    client?: Anthropic
    model?: string
    maxTokens?: number
    systemPrompt?: string
    analysisPromptTemplate?: string
    maxRetries?: number
}

// Validates both the model's tool-use payload and any persisted row before
// rendering — Anthropic's JSON-schema for tools is advisory, so the boundary
// check is what actually guarantees shape.
export const analysisReportSchema = z.object({
    proposalSummary: z.string(),
    codeExplanation: z.string(),
    resultsSummary: z.string().optional(),
    alignmentCheck: z.object({
        isAligned: z.boolean(),
        findings: z.array(z.string()).default([]),
    }),
    complianceCheck: z.object({
        isCompliant: z.boolean(),
        findings: z.array(z.string()).default([]),
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
