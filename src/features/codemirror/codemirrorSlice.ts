import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import {
    EditorSelection,
    EditorState,
    Extension,
    StateField,
    Transaction,
} from '@codemirror/state'
import { FullState } from '../window/state'
import { EditorView } from '@codemirror/view'
import {
    customDispatch,
    syncDispatch,
} from '../../components/codemirrorHooks/dispatch'

interface RegisterEditor {
    tabId: number
    editorId: number
}

interface UpsertEditor {
    tabId: number
    editorStateConfig: {
        initialState?: {
            json: any
            fields?: Record<string, StateField<any>>
        }
        config: {
            doc?: string
            selection?:
                | EditorSelection
                | {
                      anchor: number
                      head?: number
                  }
            extensions: Extension[]
        }
    }
    useCustomDispatch?: boolean
}

function createEditorView(
    editorStateConfig: UpsertEditor['editorStateConfig'],
    useCustomDispatch?: boolean
): EditorView {
    const { initialState, config } = editorStateConfig
    const editorState = initialState
        ? EditorState.fromJSON(
              initialState.json,
              config,
              initialState.fields
          )
        : EditorState.create(config)

    let view!: EditorView
    view = new EditorView({
        state: editorState,
        dispatch: useCustomDispatch
            ? (tr) => customDispatch(view, tr)
            : undefined,
    })
    return view
}

function nextEditorId(state: CodeMirrorState): number {
    if (state.editorIds.length === 0) return 1
    return Math.max(...state.editorIds) + 1
}

// Internal state management for CodeMirror views
let codeMirrorViews: ReadonlyArray<[number, EditorView]> = []

function cleanViews(state: CodeMirrorState) {
    // Destroy views that have been deleted from state
    codeMirrorViews
        .filter(([viewId, _view]) => !state.editorIds.includes(viewId))
        .forEach(([_viewId, view]) => void view.destroy())
    codeMirrorViews = codeMirrorViews.filter(([viewId, _view]) =>
        state.editorIds.includes(viewId)
    )
}

function addCodeMirrorView(id: number, view: EditorView) {
    codeMirrorViews = [...codeMirrorViews, [id, view]]
}
// You may now export any of these

export const getCodeMirrorView = (editorId: number) => {
    const view = codeMirrorViews.find(([viewId]) => viewId === editorId)
    if (view) {
        return view[1]
    }
    return null
}

export interface CodeMirrorState {
    editorIds: number[]
    editorMap: {
        // Maps tab ids to editorIds
        [tabId: number]: number
    }
}
export interface FullCodeMirrorState {
    codeMirrorState: CodeMirrorState
    global: FullState['global']
}

export const initialCodeMirrorState: CodeMirrorState = {
    editorIds: [],
    editorMap: {},
}

function updateSyncViews(codeMirrorState: CodeMirrorState, tabIds: number[]) {
    const views = tabIds.map((tabId) => {
        const editorId = codeMirrorState.editorMap[tabId]
        return getCodeMirrorView(editorId)!
    })
    for (let i = 0; i < tabIds.length; i++) {
        const currentView = views[i]
        const otherViews = views.filter((view) => view !== currentView)
        const customDispatch = (tr: Transaction) =>
            syncDispatch(tr, currentView, ...otherViews)

        currentView.dispatch = ((...input: any[]) => {
            if (input.length === 1 && input[0] instanceof Transaction) {
                customDispatch(input[0])
            } else {
                customDispatch(currentView.state.update(...input))
            }
        }) as typeof currentView.dispatch
    }
}

export const upsertEditor = createAsyncThunk(
    'codemirror/createEditor',
    async (
        { tabId, editorStateConfig, useCustomDispatch }: UpsertEditor,
        { getState, dispatch }
    ) => {
        const cmState = (getState() as FullCodeMirrorState).codeMirrorState
        if (tabId in cmState.editorMap) return

        const editorId = nextEditorId(cmState)
        const view = createEditorView(editorStateConfig, useCustomDispatch)
        addCodeMirrorView(editorId, view)
        dispatch(_registerEditor({ tabId, editorId }))

        const state = (<FullState>getState()).global
        const fileId = state.tabs[tabId].fileId

        const similarTabIds = Object.keys(state.tabs).filter(
            (otherTabId) =>
                parseInt(otherTabId) !== tabId &&
                state.tabs[parseInt(otherTabId)].fileId === fileId
        )

        if (similarTabIds.length > 0) {
            const allTabIds = [
                tabId,
                ...similarTabIds.map((id) => parseInt(id)),
            ]
            updateSyncViews(
                (getState() as FullCodeMirrorState).codeMirrorState,
                allTabIds
            )
        }
    }
)

export const removeEditor = createAsyncThunk(
    'codemirror/removeEditor',
    async ({ tabId }: { tabId: number }, { getState, dispatch }) => {
        dispatch(_removeEditor({ tabId }))
        const state = (<FullState>getState()).global
        const fileId = state.tabs[tabId].fileId
        const similarTabIds = Object.keys(state.tabs).filter(
            (otherTabId) =>
                parseInt(otherTabId) !== tabId &&
                state.tabs[parseInt(otherTabId)].fileId === fileId
        )

        // Then we change the other tabs to be the same
        if (similarTabIds.length > 0) {
            updateSyncViews(
                (getState() as FullCodeMirrorState).codeMirrorState,
                similarTabIds.map((id) => parseInt(id))
            )
        }
    }
)

export const codeMirrorSlice = createSlice({
    name: 'codeMirrorState',
    initialState: initialCodeMirrorState as CodeMirrorState,
    extraReducers: (_builder) => {
        // Case for installing a language server
    },
    reducers: {
        _registerEditor: (state, action: PayloadAction<RegisterEditor>) => {
            const { tabId, editorId } = action.payload
            if (!(tabId in state.editorMap)) {
                state.editorIds.push(editorId)
                state.editorMap[tabId] = editorId
            }
            cleanViews(state)
        },
        _removeEditor: (state, action: PayloadAction<{ tabId: number }>) => {
            const { tabId } = action.payload

            if (tabId in state.editorMap) {
                const editorId = state.editorMap[tabId]
                delete state.editorMap[tabId]
                state.editorIds = state.editorIds.filter(
                    (eid) => eid !== editorId
                )
            }
            // Then we clean the views
            cleanViews(state)
        },
        transferEditor: (
            state,
            action: PayloadAction<{ oldTabId: number; newTabId: number }>
        ) => {
            const { oldTabId, newTabId } = action.payload
            if (oldTabId in state.editorMap) {
                const editorId = state.editorMap[oldTabId]
                delete state.editorMap[oldTabId]
                state.editorMap[newTabId] = editorId
            }
            // Then we clean the views
            cleanViews(state)
        },
    },
})

export const { _registerEditor, _removeEditor, transferEditor } =
    codeMirrorSlice.actions
