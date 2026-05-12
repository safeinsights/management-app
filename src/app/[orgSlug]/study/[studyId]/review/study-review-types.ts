import type { StudyReviewLookup } from '@/server/db/queries'

export type StudyReviewResult = { kind: 'disabled' } | StudyReviewLookup
