import { FC } from 'react'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import type { BannerCopy } from '@/lib/study-banners'

// The single render for a BannerCopy dated from a status row, so the screens that show one cannot
// drift apart on variant, title format or body placement.
export const DatedStatusBanner: FC<{ copy: BannerCopy; at: Date | string | null }> = ({ copy, at }) => (
    <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, at)}>
        {copy.body}
    </StatusAlert>
)
