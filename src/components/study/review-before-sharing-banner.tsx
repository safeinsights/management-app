import { FC } from 'react'
import { StatusAlert, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'

// Once the key decrypts, the outputs step's banner stops asking for a key and starts warning about
// what the reviewer is about to share. Shared by the errored (OTTER-675) and outputs-available
// (OTTER-676) screens so the two flows cannot drift apart. The footnote is a real element
// referenced by aria-describedby, so the asterisk's meaning reaches AT instead of being implied
// by position.
const FOOTNOTE_ID = 'outputs-sensitive-data-footnote'

export const ReviewBeforeSharingBanner: FC<{ labName: string }> = ({ labName }) => (
    <StatusAlert variant={STATUS_ALERT_VARIANT.action} title="Review the outputs before sharing">
        <span aria-describedby={FOOTNOTE_ID}>
            As the reviewer, you are responsible for checking the outputs for sensitive or restricted information*
            before they are shared with {labName}.
        </span>
        <span id={FOOTNOTE_ID} style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
            *Sensitive data could cause harm if disclosed, such as personally identifiable information (PII). Restricted
            data is limited by a data use agreement or policy.
        </span>
    </StatusAlert>
)
