/**
 * Simple module-level store for uploaded File objects.
 * File objects can't be serialized to sessionStorage, so we keep them in memory.
 * This persists across client-side navigation but is cleared on page refresh.
 */

interface UploadedFilesState {
    files: File[]
    mainFileName: string
}

const store: Map<string, UploadedFilesState> = new Map()
const listeners = new Set<() => void>()

function notify() {
    listeners.forEach((listener) => listener())
}

export const uploadFileStore = {
    subscribe(listener: () => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
    },

    set(studyId: string, files: File[], mainFileName: string) {
        store.set(studyId, { files, mainFileName })
        notify()
    },

    get(studyId: string): UploadedFilesState | undefined {
        return store.get(studyId)
    },

    clear(studyId: string) {
        store.delete(studyId)
        notify()
    },

    getFiles(studyId: string): File[] {
        return store.get(studyId)?.files ?? []
    },

    getMainFileName(studyId: string): string {
        return store.get(studyId)?.mainFileName ?? ''
    },

    removeFile(studyId: string, fileName: string) {
        const state = store.get(studyId)
        if (state) {
            state.files = state.files.filter((f) => f.name !== fileName)
            if (state.mainFileName === fileName) {
                state.mainFileName = state.files[0]?.name ?? ''
            }
            notify()
        }
    },

    setMainFile(studyId: string, fileName: string) {
        const state = store.get(studyId)
        if (state) {
            state.mainFileName = fileName
            notify()
        }
    },
}
