import { Language } from "@/database/types"

export const CONTEXT_NAMES = ['SYSTEM', 'R', 'PYTHON'] as const
export type ContextName = 'SYSTEM' | Language
