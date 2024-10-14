'use client'

import { Text } from '@mantine/core'
import { useEffect } from 'react'
import { notifications } from '@mantine/notifications'

// use a constant object to store the state of the component
// this prevents re-displaying if they navigate away and back
const state = {
    shown: true,
}

export const YodaNotice = () => {
    useEffect(() => {
        if (state.shown) return
        state.shown = true

        setTimeout(() => {
            notifications.show({
                message: (
                    <Text fz={13} c="gray">
                        Hmm, a new researcher, you are.
                        <br />
                        Curious, your mind is, yes.
                        <br />
                        Patience, you must have, for many 🐛 encounter, you will.
                        <br />
                        Questions, ask many, for in the asking:
                        <br />
                        answers revealed, they are.
                        <br />
                    </Text>
                ),
                color: 'blue',
                autoClose: 30_000,
                position: 'top-right',
            })
        }, 2000)
    }, [])

    return null
}
