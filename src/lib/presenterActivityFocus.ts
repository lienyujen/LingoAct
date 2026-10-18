export type WorkspaceView = 'activities' | 'current' | 'history'
type Focus = { view: WorkspaceView; questionId: string | null; activeId: string | null; revision: number }

// Navigation and a confirmed dispatch invalidate older reads. Realtime can then
// reconcile without moving the teacher back to a previously selected activity.
export function createPresenterActivityFocus() {
  let state: Focus = { view: 'activities', questionId: null, activeId: null, revision: 0 }
  return {
    snapshot: () => ({ ...state }),
    accepts: (snapshot: Focus) => snapshot.revision === state.revision,
    select(view: WorkspaceView, questionId: string | null) {
      state = { ...state, view, questionId, revision: state.revision + 1 }
      return { ...state }
    },
    dispatch(questionId: string) {
      state = { view: 'current', questionId, activeId: questionId, revision: state.revision + 1 }
      return { ...state }
    },
    reconcile(snapshot: Focus, activeId: string | null, ids: string[]) {
      if (snapshot.revision !== state.revision) return null
      const newlyActive = activeId !== null && activeId !== state.activeId
      const view = newlyActive ? 'current' : state.view
      const questionId = view === 'history' && state.questionId && ids.includes(state.questionId)
        ? state.questionId : activeId || ids.at(-1) || null
      state = { ...state, view, questionId, activeId }
      return { ...state }
    },
  }
}
