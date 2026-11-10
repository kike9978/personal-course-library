import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

function notionErrorText(error, fallback) {
  const text = String(error?.message || '')
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/, '')
  return text || fallback
}

function useNotionSync() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .getNotionSync?.()
      .then((next) => {
        if (!cancelled && next) setStatus(next)
      })
      .catch(() => {})
    const unsubscribe = window.api.onNotionSync?.((next) => setStatus(next))
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return status
}

function syncLabel(status) {
  if (!status?.enabled) return 'Apagado'
  if (status.syncing || status.queued) return 'Sincronizando…'
  if (status.lastError) return 'Error'
  return 'Activo'
}

export function NotionSyncButton() {
  const status = useNotionSync()
  const dialogRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [databaseId, setDatabaseId] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncingNow, setSyncingNow] = useState(false)
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    if (!open) return undefined
    const current = statusRef.current
    setDatabaseId(current?.databaseId || '')
    setToken('')
    const dialog = dialogRef.current
    const frame = requestAnimationFrame(() => {
      if (dialog && !dialog.open) {
        try {
          dialog.showModal()
        } catch {
          // The dialog is already open.
        }
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  const close = () => {
    dialogRef.current?.close()
    setOpen(false)
  }

  const save = async (turningOn) => {
    setSaving(true)
    try {
      const next = await window.api.setNotionSync({
        enabled: turningOn === true,
        token,
        databaseId
      })
      setToken('')
      if (next) setDatabaseId(next.databaseId || '')
      toast.success(
        turningOn
          ? 'Notion activado. Las notas se envían al guardar.'
          : 'Notion apagado. No se envió nada.'
      )
    } catch (error) {
      toast.error(notionErrorText(error, 'No se pudo guardar Notion'))
    } finally {
      setSaving(false)
    }
  }

  const syncAll = async () => {
    setSyncingNow(true)
    try {
      await window.api.syncNotionNow()
      toast.success('Sincronización pedida')
    } catch (error) {
      toast.error(notionErrorText(error, 'No se pudo sincronizar'))
    } finally {
      setSyncingNow(false)
    }
  }

  const resolveDelete = async (findingId, choice) => {
    try {
      await window.api.resolveNotionDelete(findingId, choice)
      toast.success(choice === 'keep' ? 'Nota recuperada desde Notion' : 'Página borrada en Notion')
    } catch (error) {
      toast.error(notionErrorText(error, 'No se pudo resolver el borrado'))
    }
  }

  const conflictCount = (status?.conflicts?.length || 0) + (status?.deleteConflicts?.length || 0)

  return (
    <>
      <button
        type="button"
        className="btn btn--ghost notion-sync-btn"
        onClick={() => setOpen(true)}
        title={status?.lastError || 'Sincronizar anotaciones con Notion'}
      >
        Notion
        {status?.enabled || conflictCount ? (
          <small>
            {[
              status?.enabled ? syncLabel(status) : null,
              conflictCount ? `${conflictCount} en conflicto` : null
            ]
              .filter(Boolean)
              .join(' · ')}
          </small>
        ) : null}
      </button>
      {open ? (
        <dialog
          ref={dialogRef}
          className="dialog notion-sync-dialog"
          onClick={(event) => {
            if (event.target === dialogRef.current) close()
          }}
          onClose={close}
        >
          <form
            className="dialog__form"
            onSubmit={(event) => {
              event.preventDefault()
              void save(true)
            }}
          >
            <h3>Notion</h3>
            <p className="dialog__lead">
              Apagado, las anotaciones se quedan en este equipo. Encendido, el título y el texto se
              envían al guardar y al abrir la app. Cada curso es una página, cada archivo queda
              dentro, y la nota dentro de ese archivo. Otra copia de la app conectada a esta misma
              base recoge esas notas. Si los dos lados cambiaron, la nota espera a que elijas una
              versión. El cuerpo de la página en Notion es el texto de la nota.
            </p>
            <p className="notion-sync__enable">
              {status?.enabled ? 'La sincronización está encendida.' : 'La sincronización está apagada.'}
            </p>
            <div className="field">
              <label htmlFor="notion-token">Token de integración</label>
              <input
                id="notion-token"
                type="password"
                value={token}
                autoComplete="off"
                placeholder={status?.hasToken ? 'Token guardado' : 'secret_…'}
                onChange={(event) => setToken(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="notion-database">Base de datos</label>
              <input
                id="notion-database"
                value={databaseId}
                placeholder="Enlace o id de la base"
                onChange={(event) => setDatabaseId(event.target.value)}
              />
            </div>
            {status?.lastError ? <p className="notion-sync-error">{status.lastError}</p> : null}
            {status?.deleteConflicts?.length ? (
              <div className="notion-sync__deletes">
                <h4>Borrados a medias</h4>
                <p>La nota se borró aquí y Notion cambió después de la última sincronización.</p>
                {status.deleteConflicts.map((item) => (
                  <article key={item.findingId}>
                    <strong>{item.title || 'Sin título'}</strong>
                    <pre>{item.remoteBody || item.remoteTitle || 'Sin texto'}</pre>
                    <div className="dialog__actions-btns">
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => resolveDelete(item.findingId, 'discard')}
                      >
                        Borrar en Notion
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => resolveDelete(item.findingId, 'keep')}
                      >
                        Recuperar la de Notion
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="dialog__actions dialog__actions--spread">
              <button type="button" className="btn btn--ghost" onClick={close}>
                Cerrar
              </button>
              <div className="dialog__actions-btns">
                {status?.enabled ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={syncingNow || status.syncing}
                    onClick={() => void syncAll()}
                  >
                    {syncingNow || status.syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={saving}
                  onClick={() => void save(false)}
                >
                  Apagar
                </button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Activar'}
                </button>
              </div>
            </div>
          </form>
        </dialog>
      ) : null}
    </>
  )
}

export function NotionSyncConflict({
  note,
  dirty,
  localTitle,
  localBody,
  onBeforeLocal,
  onTookRemote
}) {
  const conflict = note?.notion?.conflict
  const [busy, setBusy] = useState(false)
  if (!note) return null

  const choose = async (choice) => {
    setBusy(true)
    try {
      if (choice === 'local' || choice === 'both') await onBeforeLocal?.()
      await window.api.resolveNotionConflict(note.id, choice)
      if (choice === 'remote') onTookRemote?.()
      toast.success(
        choice === 'both'
          ? 'La versión de Notion quedó en una nota nueva'
          : choice === 'remote'
            ? 'Quedó el texto de Notion'
            : 'Quedó el texto de aquí'
      )
    } catch (error) {
      toast.error(notionErrorText(error, 'No se pudo resolver el conflicto'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {note.notion?.error && !conflict ? (
        <p className="notion-sync-error">{note.notion.error}</p>
      ) : null}
      {conflict ? (
        <section className="notion-conflict" aria-label="Conflicto con Notion">
          <h3>Esta nota y Notion se separaron</h3>
          <p>
            Los dos textos cambiaron desde la última sincronización. Elige cuál se queda. Las anclas
            del video siguen en esta nota.
          </p>
          {dirty ? (
            <p>El editor tiene cambios sin guardar. Usar esta guarda ese texto y lo envía.</p>
          ) : null}
          <div className="notion-conflict__cols">
            <article>
              <h4>Esta anotación</h4>
              <pre>{[localTitle, localBody].filter(Boolean).join('\n\n') || 'Sin texto'}</pre>
            </article>
            <article>
              <h4>Notion</h4>
              <pre>
                {[conflict.remoteTitle, conflict.remoteBody].filter(Boolean).join('\n\n') ||
                  'Sin texto'}
              </pre>
            </article>
          </div>
          <div className="dialog__actions-btns">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void choose('local')}
            >
              Usar esta
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => void choose('remote')}
            >
              Usar la de Notion
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => void choose('both')}
            >
              Quedarme con las dos
            </button>
          </div>
        </section>
      ) : null}
    </>
  )
}

export function NotionSyncNoteButton({ findingId }) {
  const status = useNotionSync()
  if (!status?.enabled || !findingId) return null
  const blocked = status.conflicts?.some((item) => item.findingId === findingId)
  return (
    <button
      type="button"
      className="btn btn--ghost"
      disabled={status.syncing || blocked}
      title={blocked ? 'Elige una versión antes de sincronizar' : 'Sincronizar esta anotación'}
      onClick={() => {
        window.api.syncNotionNow(findingId).catch((error) => {
          toast.error(notionErrorText(error, 'No se pudo sincronizar'))
        })
      }}
    >
      Sincronizar
    </button>
  )
}
