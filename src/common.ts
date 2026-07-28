'use client'

import { type FC, useState, useMemo, useEffect } from 'react'
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
 * Note this only reaches inputs that spread `form.getInputProps(path)`. Mantine builds the
 * validating `onBlur` there. Controls wired by hand need their own blur handler.
 */
export function useForm<
    Values extends Record<string, unknown> = Record<string, unknown>,
    TransformValues extends _TransformValues<Values> = (values: Values) => Values,
>(input: UseFormInput<Values, TransformValues> = {}): UseFormReturnType<Values, TransformValues> {
    return mantineUseForm<Values, TransformValues>({ validateInputOnBlur: true, ...input })
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
