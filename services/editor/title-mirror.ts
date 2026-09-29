// Mirrors the collaborative title into `study.title` for the CHANGE-REQUESTED resubmit flow,
// which is the only surface that still edits the title collaboratively. Runs from the
// Hocuspocus `store` hook, so it rides the same debounced flush (and disconnect)
// that persists the canonical Yjs state.
//
// DRAFT rows are deliberately excluded (OTTER-690): Step 1 owns study.title there and writes it
// through the draft actions. Leaving DRAFT in would resurrect two data-loss paths, because
// legacy fields-docs still carry a `title` key that the DRAFT client no longer maintains: a cold
// doc would flush a blank title over the Step 1 one, and a warm doc would flush a stale one.

import * as Y from 'yjs'

import { PROPOSAL_FIELDS_MAP_NAME } from '../../src/lib/collaboration-documents.ts'
import type { DbQuery, ParsedDocumentName } from './auth.ts'

export function readTitleFromFieldsDoc(doc: Y.Doc): string | null {
    const raw = doc.getMap(PROPOSAL_FIELDS_MAP_NAME).get('title')
    if (typeof raw !== 'string') return null
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : null
}

// The SQL guard keeps a null/blank title off the row, honoring the
// study_title_required_when_not_draft CHECK constraint: CHANGE-REQUESTED is not DRAFT, so a
// blank collaborative title leaves the stored one alone rather than violating the constraint.
export async function mirrorProposalTitleToStudy(
    parsed: ParsedDocumentName,
    doc: Y.Doc,
    studyId: string,
    db: Pick<DbQuery, 'query'>,
): Promise<void> {
    if (parsed.kind !== 'proposal-fields') return

    const title = readTitleFromFieldsDoc(doc)

    if (title === null) return

    await db.query(
        `UPDATE study
            SET title = $2::text
          WHERE id = $1
            AND status = 'CHANGE-REQUESTED'`,
        [studyId, title],
    )
}
