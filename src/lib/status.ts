import type { AllStatus } from './types'

const SPECIAL_STATUSES: Record<string, string> = {
    REJECTED: 'Changes Requested',
}

export function humanizeStatus(status: AllStatus): string {
    if (SPECIAL_STATUSES[status]) {
        return SPECIAL_STATUSES[status]
    }

    const words = status.split('-')

    return words
        .map((word) => word.toLowerCase())
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}