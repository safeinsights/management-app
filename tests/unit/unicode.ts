// Escapes rather than literals, so no assertion depends on how a file is normalized on disk.
// NFD_E_ACUTE is two code units for one character, so `.length` reads it double.
export const NFD_E_ACUTE = 'e\u0301'
export const NFC_E_ACUTE = '\u00e9'
export const FAMILY_EMOJI = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}'
