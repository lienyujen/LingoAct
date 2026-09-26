import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ClipboardText, FileArrowUp, FloppyDisk, Plus, Trash, Users, X } from '@phosphor-icons/react'
import {
  deleteRoster,
  duplicateNames,
  getSessionRosterId,
  listRosters,
  newEntry,
  newRoster,
  normalizeName,
  parsePastedNames,
  saveRoster,
  setSessionRosterId,
} from '../lib/classRoster'
import { guessColumns, readRosterTable, RosterImportError } from '../lib/rosterImport'
import { usePresenterText } from '../lib/presenterI18n'
import type { ClassRoster, RosterEntry } from '../lib/classRoster'
import type { PresenterMessageKey } from '../lib/presenterI18n'
import type { Table } from '../lib/rosterImport'

type Props = {
  sessionId: string
  open: boolean
  onClose: () => void
  // The window re-reads the roster after any change rather than being handed it,
  // so there is one place that decides what the current list is.
  onChanged: () => void
}

type ColumnChoice = { name: number; studentNo: number; unit: number }

// Class lists live on this computer, not in the database, so this whole dialog
// talks to localStorage. A university teacher reuses the same list every week;
// the session only records which one it is using.
export function RosterManager({ sessionId, open, onClose, onChanged }: Props) {
  const t = usePresenterText()
  const [rosters, setRosters] = useState<ClassRoster[]>([])
  const [editing, setEditing] = useState<ClassRoster | null>(null)
  const [table, setTable] = useState<Table | null>(null)
  const [columns, setColumns] = useState<ColumnChoice>({ name: -1, studentNo: -1, unit: -1 })
  const [pasting, setPasting] = useState(false)
  const [pasteText, setPasteText] = useState('')
  // A key rather than a sentence, so the message follows the teaching language
  // like everything else on this screen.
  const [error, setError] = useState<PresenterMessageKey | ''>('')
  const fileRef = useRef<HTMLInputElement>(null)
  const appliedId = getSessionRosterId(sessionId)

  useEffect(() => {
    if (open) refresh()
  }, [open])

  function refresh() {
    setRosters(listRosters())
  }

  function openEditor(roster: ClassRoster) {
    setEditing(roster)
    setTable(null)
    setPasting(false)
    setPasteText('')
    setError('')
  }

  function backToList() {
    setEditing(null)
    setTable(null)
    setPasting(false)
    setError('')
    refresh()
  }

  function apply(rosterId: string | null) {
    setSessionRosterId(sessionId, rosterId)
    onChanged()
    refresh()
  }

  async function pickFile(file: File | null, hasHeader: boolean) {
    if (!file) return
    setError('')
    try {
      const parsed = await readRosterTable(file, hasHeader)
      if (!parsed.rows.length) throw new RosterImportError('rmNoData')
      setTable(parsed)
      const guessed = guessColumns(parsed.headers)
      // Falling back to the first column matters more than it looks: a list with
      // no header at all is one column of names, and asking the presenter to
      // pick it would be asking a question with one possible answer.
      setColumns({ ...guessed, name: guessed.name >= 0 ? guessed.name : 0 })
    } catch (caught) {
      setTable(null)
      setError(caught instanceof RosterImportError ? caught.key : 'rmReadFailed')
    }
  }

  function importRows(replace: boolean) {
    if (!editing || !table || columns.name < 0) return
    const imported = table.rows
      .map((row) => newEntry(
        row[columns.name] || '',
        columns.studentNo >= 0 ? row[columns.studentNo] || '' : '',
        columns.unit >= 0 ? row[columns.unit] || '' : '',
      ))
      .filter((entry) => entry.name)
    if (!imported.length) {
      setError('rmNoNameColumn')
      return
    }
    setEditing({ ...editing, entries: replace ? imported : [...editing.entries, ...imported] })
    setTable(null)
    setError('')
  }

  function applyPaste(replace: boolean) {
    if (!editing) return
    const pasted = parsePastedNames(pasteText)
    if (!pasted.length) {
      setError('rmNoNames')
      return
    }
    setEditing({ ...editing, entries: replace ? pasted : [...editing.entries, ...pasted] })
    setPasting(false)
    setPasteText('')
    setError('')
  }

  function updateEntry(id: string, patch: Partial<RosterEntry>) {
    if (!editing) return
    setEditing({
      ...editing,
      entries: editing.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    })
  }

  function save() {
    if (!editing) return
    const cleaned = editing.entries.filter((entry) => entry.name.trim())
    const saved = saveRoster({ ...editing, name: editing.name.trim() || t('rmUntitled'), entries: cleaned })
    // Saving the list a session is already using should take effect there at
    // once, rather than after the presenter remembers to apply it again.
    if (appliedId === saved.id) onChanged()
    backToList()
  }

  const duplicates = useMemo(
    () => (editing ? duplicateNames(editing.entries) : new Set<string>()),
    [editing],
  )

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-label={t('rmTitle')} aria-modal="true" className="modal roster-manager" role="dialog">
        <header className="roster-manager-head">
          {editing
            ? (
              <button className="icon-button" title={t('rmBack')} type="button" onClick={backToList}>
                <ArrowLeft size={18} />
              </button>
            )
            : <Users size={18} />}
          <h2>{editing ? t('rmEditTitle') : t('rmTitle')}</h2>
          <button aria-label={t('close')} className="icon-button" title={t('close')} type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {error && <p className="error">{t(error)}</p>}

        {!editing && (
          <>
            <p className="muted roster-manager-hint">{t('rmHint')}</p>
            <div className="roster-manager-actions">
              <button type="button" onClick={() => openEditor(newRoster(''))}>
                <Plus size={16} />{t('rmNew')}
              </button>
              {appliedId && (
                <button className="ghost-button" type="button" onClick={() => apply(null)}>
                  {t('rmDisable')}
                </button>
              )}
            </div>
            {rosters.length ? (
              <ul className="roster-manager-list">
                {rosters.map((roster) => (
                  <li key={roster.id}>
                    <div className="roster-manager-item">
                      <strong>{roster.name}</strong>
                      <span className="muted">{t('rmPeople', { n: roster.entries.length })}</span>
                      {appliedId === roster.id && <span className="roster-manager-applied">{t('rmInUse')}</span>}
                    </div>
                    <div className="roster-manager-item-actions">
                      {appliedId !== roster.id && (
                        <button className="ghost-button" type="button" onClick={() => apply(roster.id)}>{t('rmApply')}</button>
                      )}
                      <button className="ghost-button" type="button" onClick={() => openEditor(roster)}>{t('rmEdit')}</button>
                      <button
                        aria-label={t('rmDeleteNamed', { name: roster.name })}
                        className="icon-button"
                        title={t('rmDelete')}
                        type="button"
                        onClick={() => {
                          deleteRoster(roster.id)
                          if (appliedId === roster.id) apply(null)
                          refresh()
                        }}
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">{t('rmNoRosters')}</p>}
          </>
        )}

        {editing && (
          <>
            <label className="roster-manager-name">
              {t('rmName')}
              <input
                placeholder={t('rmNamePlaceholder')}
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </label>

            <div className="roster-manager-actions">
              <input
                accept=".csv,.xlsx"
                hidden
                ref={fileRef}
                type="file"
                onChange={(event) => {
                  void pickFile(event.target.files?.[0] || null, true)
                  event.target.value = ''
                }}
              />
              <button className="ghost-button" type="button" onClick={() => fileRef.current?.click()}>
                <FileArrowUp size={16} />{t('rmImportFile')}
              </button>
              <button className="ghost-button" type="button" onClick={() => { setPasting(true); setTable(null) }}>
                <ClipboardText size={16} />{t('rmPaste')}
              </button>
              <button className="ghost-button" type="button" onClick={() => setEditing({ ...editing, entries: [...editing.entries, newEntry()] })}>
                <Plus size={16} />{t('rmAddRow')}
              </button>
            </div>

            {pasting && (
              <div className="roster-manager-paste">
                <textarea
                  placeholder={t('rmPastePlaceholder')}
                  rows={6}
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                />
                <div className="roster-manager-actions">
                  <button type="button" onClick={() => applyPaste(true)}>{t('rmReplace')}</button>
                  <button className="ghost-button" type="button" onClick={() => applyPaste(false)}>{t('rmAppend')}</button>
                  <button className="ghost-button" type="button" onClick={() => { setPasting(false); setPasteText('') }}>{t('cancel')}</button>
                </div>
              </div>
            )}

            {table && (
              <div className="roster-manager-mapping">
                <p className="muted">{t('rmMapHint')}</p>
                <div className="roster-manager-columns">
                  {([
                    ['name', 'rmColName', true],
                    ['studentNo', 'rmColStudentNo', false],
                    ['unit', 'rmColUnit', false],
                  ] as Array<[keyof ColumnChoice, PresenterMessageKey, boolean]>).map(([key, label, required]) => (
                    <label key={key}>
                      {t(label)}{required ? t('rmRequired') : ''}
                      <select
                        value={columns[key]}
                        onChange={(event) => setColumns({ ...columns, [key]: Number(event.target.value) })}
                      >
                        {!required && <option value={-1}>{t('rmSkipColumn')}</option>}
                        {table.headers.map((header, index) => (
                          <option key={`${index}-${header}`} value={index}>{header}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="muted">
                  {t('rmRowsRead', {
                    n: table.rows.length,
                    preview: table.rows.slice(0, 3).map((row) => row[columns.name] || t('rmBlank')).join('、'),
                  })}
                </p>
                <div className="roster-manager-actions">
                  <button type="button" onClick={() => importRows(true)}>{t('rmReplace')}</button>
                  <button className="ghost-button" type="button" onClick={() => importRows(false)}>{t('rmAppend')}</button>
                  <button className="ghost-button" type="button" onClick={() => setTable(null)}>{t('cancel')}</button>
                </div>
              </div>
            )}

            {duplicates.size > 0 && (
              <p className="roster-manager-warning">{t('rmDuplicates')}</p>
            )}

            <ol className="roster-manager-entries">
              {editing.entries.map((entry, index) => (
                <li className={duplicates.has(normalizeName(entry.name)) ? 'is-duplicate' : ''} key={entry.id}>
                  <span className="roster-manager-index">{index + 1}</span>
                  <input
                    aria-label={t('rmColName')}
                    placeholder={t('rmColName')}
                    value={entry.name}
                    onChange={(event) => updateEntry(entry.id, { name: event.target.value })}
                  />
                  <input
                    aria-label={t('rmColStudentNo')}
                    placeholder={t('rmColStudentNo')}
                    value={entry.studentNo}
                    onChange={(event) => updateEntry(entry.id, { studentNo: event.target.value })}
                  />
                  <input
                    aria-label={t('rmUnitLabel')}
                    placeholder={t('rmUnitPlaceholder')}
                    value={entry.unit}
                    onChange={(event) => updateEntry(entry.id, { unit: event.target.value })}
                  />
                  <button
                    aria-label={t('rmDeleteRowN', { n: index + 1 })}
                    className="icon-button"
                    title={t('rmDeleteRow')}
                    type="button"
                    onClick={() => setEditing({ ...editing, entries: editing.entries.filter((item) => item.id !== entry.id) })}
                  >
                    <Trash size={15} />
                  </button>
                </li>
              ))}
            </ol>
            {!editing.entries.length && <p className="muted">{t('rmEmpty')}</p>}

            <div className="roster-manager-actions roster-manager-footer">
              <span className="muted">{t('rmPeople', { n: editing.entries.filter((entry) => entry.name.trim()).length })}</span>
              <button type="button" onClick={save}><FloppyDisk size={16} />{t('rmSave')}</button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
