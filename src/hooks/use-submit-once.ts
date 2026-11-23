'use client'

import { useRef } from 'react'

import { type UseMutateFunction } from '@/common'

// isPending flips only on the next render, so both clicks of a double-click would get past it.
export function useSubmitOnce<TData, TVariables>(mutate: UseMutateFunction<TData, Error, TVariables>) {
    const isLocked = useRef(false)

    const submit: typeof mutate = (variables, options) => {
        if (isLocked.current) return
        isLocked.current = true
        mutate(variables, {
            ...options,
            onError: (...args) => {
                isLocked.current = false
                options?.onError?.(...args)
            },
        })
    }

    return submit
}
