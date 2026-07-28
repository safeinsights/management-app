'use client'

import { type FC, type FocusEvent, useState, useMemo, useEffect } from 'react'
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
import { type ActionResponse } from '@/lib/types'
export * from '@/hooks/query-wrappers'

/**
 * Project-wide `useForm`. Applies `validateInputOnBlur: true` so leaving a required field
 * incomplete surfaces its error immediately (OTTER-647); Mantine defaults this to false,
 * and change-only validation can never flag a field the user never edited.
 *
 * Caller options win, so a form that needs narrower coverage can still pass a path array
 * (`validateInputOnBlur: ['name', `jobs.${FORM_INDEX}.title`]`). Import `useForm` from here
 * rather than from `@mantine/form`, otherwise the default is silently bypassed.
 *
 * `enhanceGetInputProps` is the one exception to "caller options win", deliberately: it is set
 * after the spread so the server-error guard below cannot be dropped by a caller passing its own
 * enhancer. A caller's enhancer still runs, and its return value still wins on every key except
 * the guarded `onBlur`, which wraps whatever onBlur the caller leaves in place.
 *
 * Note this only reaches inputs that spread `form.getInputProps(path)`. Mantine builds the
 * validating `onBlur` there. Controls wired by hand need their own blur handler.
 */
export function useForm<
    Values extends Record<string, unknown> = Record<string, unknown>,
    TransformValues extends _TransformValues<Values> = (values: Values) => Values,
>(input: UseFormInput<Values, TransformValues> = {}): UseFormReturnType<Values, TransformValues> {
    return mantineUseForm<Values, TransformValues>({
        validateInputOnBlur: true,
        ...input,
        enhanceGetInputProps: (payload) => {
            const callerProps = input.enhanceGetInputProps?.(payload) || {}
            const onBlur = 'onBlur' in callerProps ? callerProps.onBlur : payload.inputProps.onBlur
            if (typeof onBlur !== 'function') return callerProps

            return {
                ...callerProps,
                onBlur: (event: FocusEvent<HTMLElement>) => {
                    // Never revalidate over an error that is already showing. Mantine's blur
                    // handler clears the error whenever the client rule passes, which silently
                    // erased messages the client cannot re-derive: anything installed with
                    // `setFieldError` after a server rejection (a wrong sign-in, a used-up
                    // recovery code, a rejected reset email, a failed key decryption). Re-reading
                    // such a message and tabbing away wiped it, leaving an unchanged value and no
                    // explanation. A field with no rule at all was affected too, because Mantine
                    // clears unconditionally when validation finds nothing.
                    //
                    // Safe because `clearInputErrorOnChange` (on by default) drops the error as
                    // soon as the user edits, so the next blur validates a clean field.
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
