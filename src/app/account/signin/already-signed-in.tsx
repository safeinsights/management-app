'use client'

import { type FC } from 'react'
import { AlreadySignedInView, type AlreadySignedInViewProps } from './already-signed-in-view'

export interface AlreadySignedInProps extends AlreadySignedInViewProps {
    isVisible: boolean
}

export const AlreadySignedIn: FC<AlreadySignedInProps> = ({ isVisible, ...viewProps }) => {
    if (!isVisible) return null
    return <AlreadySignedInView {...viewProps} />
}
