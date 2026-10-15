export const INVITATION_NOTICE_STORAGE_KEY = 'si:invitation-notice'

export type InvitationNotice = {
    kind: 'skip' | 'decline'
    orgName: string
}

// sessionStorage, not a URL param: a param outlives the toast on reload and lets anyone craft a
// notice for an org that never invited them (OTTER-736). Storage can throw (blocked site data, full
// quota); losing the toast must never stop the skip or decline from navigating.
export function markInvitationNotice(notice: InvitationNotice) {
    if (typeof window === 'undefined') return

    try {
        sessionStorage.setItem(INVITATION_NOTICE_STORAGE_KEY, JSON.stringify(notice))
    } catch {
        // without storage the dashboard simply shows no toast
    }
}

export function takeInvitationNotice(): InvitationNotice | null {
    if (typeof window === 'undefined') return null

    try {
        const stored = sessionStorage.getItem(INVITATION_NOTICE_STORAGE_KEY)
        if (!stored) return null
        sessionStorage.removeItem(INVITATION_NOTICE_STORAGE_KEY)

        const parsed = JSON.parse(stored)
        const isNotice = (parsed?.kind === 'skip' || parsed?.kind === 'decline') && typeof parsed?.orgName === 'string'
        return isNotice ? parsed : null
    } catch {
        return null
    }
}
