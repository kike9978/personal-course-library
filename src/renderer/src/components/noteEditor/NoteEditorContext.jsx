import { createContext, useContext } from 'react'

export const NoteEditorContext = createContext({
  onSeekTimestamp: null,
  currentTimeSec: 0
})

export function useNoteEditorContext() {
  return useContext(NoteEditorContext)
}
