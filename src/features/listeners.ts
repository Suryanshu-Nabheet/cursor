import { store } from '../app/store'
import { connector } from '../connector'
import * as gs from './globalSlice'
import * as gt from './globalThunks'
import * as cs from './chat/chatSlice'
import * as ts from './tools/toolSlice'

////////
// GLOBAL LISTENERS
////////

// @ts-ignore
connector.registerRenameClick(() => {
    store.dispatch(gs.triggerRename(null))
})

connector.registerCloseErrors(() => {
    store.dispatch(gs.closeError())
})

// @ts-ignore
connector.registerSaved(() => {
    store.dispatch(gs.saveFile(null))
})

// @ts-ignore
connector.registerDeleteClick(() => {
    store.dispatch(gs.deleteFile(null))
})

// @ts-ignore
connector.registerOpenContainingFolderClick(() => {
    store.dispatch(gs.openContainingFolder(null))
})

// @ts-ignore
connector.registerDeleteFolderClick(() => {
    store.dispatch(gs.deleteFolder(null))
})

// @ts-ignore
connector.registerNewFileClick(() => {
    store.dispatch(gs.newFile({ parentFolderId: null }))
})

// @ts-ignore
connector.registerNewFolderClick(() => {
    store.dispatch(gs.newFolder({ parentFolderId: null }))
})

// @ts-ignore
connector.registerCloseTab(() => {
    store.dispatch(gt.closeTab(null))
})

// @ts-ignore
connector.registerCloseAllTabs(() => {
    store.dispatch(gt.closeAllTabs())
})

// @ts-ignore
connector.registerOpenFolder(() => {
    store.dispatch(gs.openFolder(null))
})

// @ts-ignore
connector.registerForceCloseTab(() => {
    store.dispatch(gs.forceCloseTab(null))
})

// @ts-ignore
connector.registerForceSaveAndCloseTab(() => {
    store.dispatch(gs.forceSaveAndClose(null))
})

// @ts-ignore
connector.registerZoom((zoom: number) => {
    store.dispatch(gs.setZoomFactor(zoom))
})

// @ts-ignore
connector.registerSearch(() => store.dispatch(ts.openSearch()))

// @ts-ignore
connector.registerFileSearch(() => {
    const state = store.getState()
    const welcomeDismissed = state.global.welcomeDismissed
    const foldersCount = Object.keys(state.global.folders || {}).length
    if (foldersCount <= 1 && !welcomeDismissed) return
    store.dispatch(ts.triggerFileSearch())
})

// @ts-ignore
connector.registerCommandPalette(() => {
    const state = store.getState()
    const welcomeDismissed = state.global.welcomeDismissed
    const foldersCount = Object.keys(state.global.folders || {}).length
    if (foldersCount <= 1 && !welcomeDismissed) return
    store.dispatch(ts.triggerCommandPalette())
})

// @ts-ignore
connector.registerGetDefinition((payload: { path: string; offset: number }) => {
    store.dispatch(gs.gotoDefinition(payload))
})

// @ts-ignore
connector.registerLearnCodebase(() => {
    store.dispatch(gs.initializeIndex(null))
})

// @ts-ignore ipc callbacks receive event payloads
connector.registerFolderWasAdded((_evt: any, payload: any) => {
    store.dispatch(gs.folderWasAdded(payload))
})

// @ts-ignore
connector.registerFolderWasDeleted((_evt: any, payload: any) => {
    store.dispatch(gs.folderWasDeleted(payload))
})

// @ts-ignore
connector.registerFileWasAdded((_evt: any, payload: any) => {
    store.dispatch(gs.fileWasAdded(payload))
})

// @ts-ignore
connector.registerFileWasDeleted((_evt: any, payload: any) => {
    store.dispatch(gs.fileWasDeleted(payload))
})

// @ts-ignore
connector.registerFileWasUpdated((_evt: any, payload: any) => {
    store.dispatch(gs.fileWasUpdated(payload))
})

// @ts-ignore
connector.registerOpenRemotePopup((_evt: any, _payload: any) => {
    store.dispatch(gs.openRemotePopup())
})

/////////
// CHAT LISTENERS
/////////
// @ts-ignore
connector.registerAddCodeToPrompt((payload: any) => {
    store.dispatch(cs.addOtherBlockToMessage(payload))
})
