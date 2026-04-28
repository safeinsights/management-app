import type Anthropic from '@anthropic-ai/sdk'

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
 * - referenceDocs.dataDocs: fetched from OrgDataSource.documentationUrl entries
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

/**
 * Structured analysis output from the ReviewAgent.
 */
export interface AnalysisReport {
    proposalSummary: string
    codeExplanation: string
    resultsSummary?: string
    alignmentCheck: {
        isAligned: boolean
        findings: string[]
    }
    complianceCheck: {
        isCompliant: boolean
        findings: string[]
    }
}
