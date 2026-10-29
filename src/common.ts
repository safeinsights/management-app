'use client'

import { type FC, type FocusEvent, type ReactNode, createElement, useState, useMemo, useEffect } from 'react'
import { z } from 'zod'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import {
    useForm as mantineUseForm,
    type UseFormInput,
    type UseFormReturnType,
    type _TransformValues,
} from '@mantine/form'
import { Button, Flex } from '@mantine/core'
import { Link, ButtonLink } from './components/links'
import { InputError } from '@/components/errors'
import { type ActionResponse } from '@/lib/types'
export * from '@/hooks/query-wrappers'

// Booleans pass through: Mantine reads `true` as "invalid, no message" (sign-in marks the email that way).
const withErrorIcon = (error: unknown) =>
    error && typeof error !== 'boolean' ? createElement(InputError, { error: error as ReactNode }) : error

// Project-wide `useForm`, applying `validateInputOnBlur: true` (OTTER-647). Import from here, not
// `@mantine/form`, or the default is silently bypassed.
export function useForm<
    Values extends Record<string, unknown> = Record<string, unknown>,
    TransformValues extends _TransformValues<Values> = (values: Values) => Values,
>(input: UseFormInput<Values, TransformValues> = {}): UseFormReturnType<Values, TransformValues> {
    return mantineUseForm<Values, TransformValues>({
        validateInputOnBlur: true,
        ...input,
        // Deliberately after the spread, the one exception to "caller options win": the caller's
        // enhancer is wrapped rather than trusted, so it cannot drop the server-error onBlur
        // guard below (OTTER-647) or the design's error icon (OTTER-873).
        enhanceGetInputProps: (payload) => {
            const callerProps = input.enhanceGetInputProps?.(payload) || {}
            const errorProps =
                'error' in payload.inputProps && !('error' in callerProps)
                    ? { error: withErrorIcon(payload.inputProps.error) }
                    : {}
            const onBlur = 'onBlur' in callerProps ? callerProps.onBlur : payload.inputProps.onBlur
            if (typeof onBlur !== 'function') return { ...callerProps, ...errorProps }

            return {
                ...callerProps,
                ...errorProps,
                onBlur: (event: FocusEvent<HTMLElement>) => {
                    // Never revalidate over a showing error: Mantine's blur handler clears it
                    // whenever the client rule passes, wiping server `setFieldError` messages the
                    // client cannot re-derive. `clearInputErrorOnChange` still drops it on edit.
                    if (payload.form.errors[payload.field as string]) return
                    onBlur(event)
                },
            }
        },
    })
}

export {
    zod4Resolver as zodResolver,
    Button,
    Flex,
    Link,
    ButtonLink,
    useMemo,
    useState,
    useEffect,
    type FC,
    type ActionResponse,
    z,
}
