// use this page to test the error boundary
'use client'

import { useEffect } from 'react'

export default function ErrorDemoPage() {
    useEffect(() => {
        throw new Error('Test error')
    }, [])

    return null
}
