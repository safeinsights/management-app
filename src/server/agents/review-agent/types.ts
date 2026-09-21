import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export interface ReferenceDocs {
    requirements: string
    brcDocs: string
    dataDocs: string
    otherDocs: string
}

// All fields carry pre-loaded content, never file paths or URLs.
export interface ReviewContent {
    proposal: string
    codeFiles: Record<string, string>
    referenceDocs: ReferenceDocs
    researcherTestResults?: string
}

// `additionalContext` is appended to `systemPrompt` rather than replacing it.
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

// Mirrors ANALYSIS_TOOL in agent.ts so AnalysisReport has one source, and guards the write
// boundary against SDK/model regression.
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

export type AnalysisReport = z.infer<typeof analysisReportSchema>

// Stored alongside the report so a future follow-up chat can resume by appending a user turn.
export interface ReviewMessage {
    role: 'user' | 'assistant'
    content: string
}

// `messages` is the seed conversation to persist for chat continuation.
export interface AnalysisResult {
    report: AnalysisReport
    messages: ReviewMessage[]
}
