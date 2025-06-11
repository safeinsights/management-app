'use client'

import { forwardRef } from 'react'

interface RefWrapperProps {
    children: React.ReactNode
    className?: string
}

//  wrapper that makes content focusable and handles Enter
export const RefWrapper = forwardRef<HTMLDivElement, RefWrapperProps>(({ children, className }, ref) => (
    <div
        ref={ref}
        tabIndex={0}
        className={className}
        onKeyDown={(e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.querySelector<HTMLElement>('a, button, [role="button"]')?.click()
            }
        }}
    >
        {children}
    </div>
))

RefWrapper.displayName = 'RefWrapper'
