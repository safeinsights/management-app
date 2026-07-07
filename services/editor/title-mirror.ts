// Mirrors the collaborative title into `study.title` so drafts are discoverable
// on the dashboard, which reads the column rather than Yjs. Runs from the
// Hocuspocus `store` hook, so it rides the same debounced flush (and disconnect)
// that persists the canonical Yjs state.

import * as Y from 'yjs'

import { PROPOSAL_FIELDS_MAP_NAME } from '../../src/lib/collaboration-documents.ts'
import type { DbQuery, ParsedDocumentName } from './auth.ts'

export function readTitleFromFieldsDoc(doc: Y.Doc): string | null {
    const raw = doc.getMap(PROPOSAL_FIELDS_MAP_NAME).get('title')
    if (typeof raw !== 'string') return null
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : null
}

// The SQL guard keeps a null/blank title off any non-DRAFT row, honoring the
// study_title_required_when_not_draft CHECK constraint.
export async function mirrorProposalTitleToStudy(
    parsed: ParsedDocumentName,
    doc: Y.Doc,
    studyId: string,
    db: Pick<DbQuery, 'query'>,
): Promise<void> {
    if (parsed.kind !== 'proposal-fields') return

    const title = readTitleFromFieldsDoc(doc)

    await db.query(
        `UPDATE study
            SET title = $2::text
          WHERE id = $1
            AND status IN ('DRAFT', 'CHANGE-REQUESTED')
            AND ($2::text IS NOT NULL OR status = 'DRAFT')`,
        [studyId, title],
    )
}
