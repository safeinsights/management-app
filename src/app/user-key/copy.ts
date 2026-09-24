import { semanticColor } from '@/theme/tokens'

// Shared by /user-key and the reset case of /account/keys, which OTTER-741 requires to warn
// identically.

export const KEY_RESET_WARNING =
    'A new key cannot decrypt your current outputs. It works only for outputs encrypted after you generate it.'

export const KEY_RESET_MODAL_TITLE = 'Confirm key reset'

export const KEY_RESET_MODAL_BODY =
    'A new key cannot decrypt your current outputs. If you no longer have your key and no one in your organization can access them, those outputs will be lost. This action cannot be undone.'

export const KEY_RESET_CONFIRM_COLOR = semanticColor('error.bg.dark')
