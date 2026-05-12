import { Language } from "@/database/types"

export const CONTEXT_NAMES = ['SYSTEM', 'R', 'PYTHON'] as const
export type ContextName = 'SYSTEM' | Language

type ContextInfo = {
    label: string,
    description: string
}

export const CONTEXT_LABELS: Record<ContextName, ContextInfo> = {
    "SYSTEM": { label: "System context", description: "Context about how SafeInsights works" },
    "R": { label: "R context", description: "Context about using the R programming language" },
    "PYTHON": { label: "Python context", description: "Context about using the Python programming language" }
}
