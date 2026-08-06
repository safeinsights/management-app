import { useEffect } from 'react'
import posthog from 'posthog-js'

let initialized = false

export function usePostHogInit(projectToken: string) {
    useEffect(() => {
        if (!projectToken || initialized) return
        initialized = true
        posthog.init(projectToken, {
            api_host: 'https://us.i.posthog.com',
            defaults: '2026-05-30',
            debug: process.env.NODE_ENV === 'development',
        })
    }, [projectToken])
}
