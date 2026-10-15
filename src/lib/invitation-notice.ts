export const INVITATION_NOTICE_STORAGE_KEY = 'si:invitation-notice'

export type InvitationNotice = {
    kind: 'skip' | 'decline'
    orgName: string
}

// sessionStorage, not a URL param: a param outlives the toast on reload and lets anyone craft a
// notice for an org that never invited them (OTTER-736).
export function markInvitationNotice(notice: InvitationNotice) {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(INVITATION_NOTICE_STORAGE_KEY, JSON.stringify(notice))
}

export function takeInvitationNotice(): InvitationNotice | null {
    if (typeof window === 'undefined') return null

    const stored = sessionStorage.getItem(INVITATION_NOTICE_STORAGE_KEY)
    if (!stored) return null
    sessionStorage.removeItem(INVITATION_NOTICE_STORAGE_KEY)

    try {
        const parsed = JSON.parse(stored)
        const isNotice = (parsed?.kind === 'skip' || parsed?.kind === 'decline') && typeof parsed?.orgName === 'string'
        return isNotice ? parsed : null
    } catch {
        return null
    }
}
