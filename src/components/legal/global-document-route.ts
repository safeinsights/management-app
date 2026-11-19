import { Routes } from '@/lib/routes'
import type { GlobalLegalDocumentType } from '@/schema/legal-document'

export const globalDocumentRoute = (type: GlobalLegalDocumentType) =>
    type === 'TOS' ? Routes.termsOfService : Routes.privacyNotice
