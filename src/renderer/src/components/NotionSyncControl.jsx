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
  if (status.syncing && status.syncTotal) return `${status.syncDone} de ${status.syncTotal}`
  if (status.syncing || status.queued) return 'Sincronizando…'
  if (status.lastError) return 'Error'
  return 'Activo'
}

function SyncProgress({ status, active }) {
  const total = status?.syncTotal || 0
  const done = status?.syncDone || 0
  const known = Boolean(status?.syncing && total)
  const percent = known ? Math.min(100, Math.round((done / total) * 100)) : 0
  if (!active) return null
  return (
    <div
      className={`notion-sync__progress${known ? '' : ' is-waiting'}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={known ? total : undefined}
      aria-valuenow={known ? done : undefined}
      aria-label="Sincronización con Notion"
    >
      <span>{known ? `${done} de ${total}` : 'Preparando…'}</span>
      <div className="notion-sync__progress-track">
        <div className="notion-sync__progress-fill" style={known ? { width: `${percent}%` } : undefined} />
      </div>
    </div>
  )
}

function choiceLabel(choice, kind) {
  if (choice === 'local' && kind === 'progress') return 'En curso se quedó como en esta biblioteca'
  if (choice === 'remote' && kind === 'progress') return 'En curso se quedó como en Notion'
  if (choice === 'json') return 'Los dibujos se comparten como JSON'
  if (choice === 'image') return 'Se comparte solo la imagen del dibujo'
  if (choice === 'local' && kind === 'dibujo') return 'Los dibujos se quedan en esta biblioteca'
  if (choice === 'both') return 'La versión de Notion quedó en una nota nueva'
  if (choice === 'remote') return 'Quedó el texto de Notion'
  if (choice === 'keep') {
    return kind === 'lista' ? 'Lista recuperada desde Notion' : 'Nota recuperada desde Notion'
  }
  if (choice === 'discard') return 'Página borrada en Notion'
  return 'Quedó el texto de aquí'
}

const DRAWING_CHOICES = [
  [
    'json',
    'Compartir como JSON',
    'Notion recibe un archivo .json. La otra copia lo vuelve a guardar como dibujo editable, y también recibe la imagen.'
  ],
  [
    'image',
    'Solo la imagen',
    'Se comparte la vista previa. El dibujo editable se queda en este equipo.'
  ],
  [
    'local',
    'Dejarlo aquí',
    'Ni el dibujo ni su imagen se suben. El texto de la nota sí se sincroniza.'
  ]
]

function VersionChoice({ title, localText, remoteText, busy, onChoose, allowBoth = false }) {
  return (
    <article>
      <strong>{title}</strong>
      <div className="notion-conflict__cols">
        <div>
          <h4>Esta biblioteca</h4>
          <pre>{localText || 'Sin texto'}</pre>
        </div>
        <div>
          <h4>Notion</h4>
          <pre>{remoteText || 'Sin texto'}</pre>
        </div>
      </div>
      <div className="dialog__actions-btns">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => onChoose('local')}
        >
          Usar esta
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => onChoose('remote')}
        >
          Usar la de Notion
        </button>
        {allowBoth ? (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => onChoose('both')}
          >
            Quedarme con las dos
          </button>
        ) : null}
      </div>
    </article>
  )
}

export function NotionSyncButton() {
  const status = useNotionSync()
  const dialogRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [databaseId, setDatabaseId] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncingNow, setSyncingNow] = useState(false)
  const [resolvingId, setResolvingId] = useState('')
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
          ? 'Notion activado. Notas y listas se comparten al guardar.'
          : 'Notion apagado. Esta biblioteca deja de compartir.'
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

  const resolveWith = async (id, choice, run, fallback, kind) => {
    setResolvingId(id)
    try {
      await run()
      toast.success(choiceLabel(choice, kind))
    } catch (error) {
      toast.error(notionErrorText(error, fallback))
    } finally {
      setResolvingId('')
    }
  }

  const conflictCount =
    (status?.conflicts?.length || 0) +
    (status?.deleteConflicts?.length || 0) +
    (status?.playlistConflicts?.length || 0) +
    (status?.playlistDeleteConflicts?.length || 0) +
    (status?.progressConflicts?.length || 0)
  const retryingSave = status?.lastErrorCode === 'conflict_error' && (status.syncing || status.queued)

  return (
    <>
      <button
        type="button"
        className={`btn btn--ghost notion-sync-btn${status?.enabled ? ' is-on' : ''}${status?.lastError ? ' is-error' : ''}`}
        onClick={() => setOpen(true)}
        title={status?.lastError || 'Conectar la biblioteca con Notion'}
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
              Conecta esta biblioteca con una base de Notion. Otra copia de la app que use la misma
              base comparte lo que se guarda aquí.
            </p>
            <ul className="notion-sync__scope">
              <li>
                <strong>Notas</strong>
                <span>
                  Título, texto e imágenes. Cada curso es una página, cada archivo queda dentro y la
                  nota dentro de ese archivo.
                </span>
              </li>
              <li>
                <strong>Progreso</strong>
                <span>
                  En curso, lecciones completadas y la última lección, bajo una página Progreso. Si
                  en curso cambió aquí y en Notion, eliges cuál se queda. Las lecciones completadas
                  se unen.
                </span>
              </li>
              <li>
                <strong>Listas</strong>
                <span>
                  Título, motivo, cursos y listas anidadas, bajo una página Listas. El lugar en el
                  tablero se queda en este equipo.
                </span>
              </li>
            </ul>
            <p className="dialog__lead">
              El título, la academia, el instructor, la descripción y la portada de cada curso siguen
              en su carpeta, igual que los archivos del curso. Si una nota cambió aquí y en Notion,
              espera a que elijas una versión.
            </p>
            <p className="notion-sync__enable">
              {status?.enabled
                ? 'Esta biblioteca está conectada.'
                : 'Esta biblioteca está desconectada.'}
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
            {status?.drawings?.length ? (
              <div className="notion-sync__deletes">
                <h4>Dibujos</h4>
                <p>
                  Notion no acepta la extensión .excalidraw, así que el dibujo editable no se puede
                  subir con ese nombre.
                  {status.drawings.length === 1
                    ? ` Hay uno en «${status.drawings[0].noteTitle}».`
                    : ` Hay ${status.drawings.length} en las notas.`}
                </p>
                {!status.drawingShare ? (
                  <p>
                    Mientras no elijas, se comparte la imagen y el dibujo editable se queda en este
                    equipo.
                  </p>
                ) : null}
                <div className="dialog__actions-btns notion-sync__choices">
                  {DRAWING_CHOICES.map(([choice, label]) => (
                    <button
                      key={choice}
                      type="button"
                      className={`btn ${status.drawingShare === choice ? 'btn--primary' : 'btn--ghost'}`}
                      aria-pressed={status.drawingShare === choice}
                      disabled={resolvingId === 'drawing-share'}
                      onClick={() => {
                        if (status.drawingShare === choice) return
                        void resolveWith(
                          'drawing-share',
                          choice,
                          () => window.api.setNotionDrawingShare(choice),
                          'No se pudo guardar la elección',
                          'dibujo'
                        )
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p>
                  {DRAWING_CHOICES.find(([choice]) => choice === status.drawingShare)?.[2] ||
                    'Elige una opción. Puedes cambiarla después.'}
                </p>
              </div>
            ) : null}
            {status?.lastError ? (
              <p className="notion-sync-error">
                {status.lastError}
                {retryingSave ? ' Se vuelve a intentar.' : ''}
                {status.lastErrorCode === 'conflict_error' && !retryingSave
                  ? ' Sincronizar ahora lo vuelve a intentar.'
                  : ''}
              </p>
            ) : null}
            {status?.progressConflicts?.length ? (
              <div className="notion-sync__deletes">
                <h4>En curso por elegir</h4>
                <p>
                  El interruptor cambió aquí y en Notion. Las lecciones completadas de los dos lados
                  ya se unieron.
                </p>
                {status.progressConflicts.map((item) => (
                  <article key={item.coursePath}>
                    <strong>{item.title || item.coursePath}</strong>
                    <div className="notion-conflict__cols">
                      <div>
                        <h4>Esta biblioteca</h4>
                        <pre>{item.localInProcess ? 'En curso' : 'Sin marcar'}</pre>
                      </div>
                      <div>
                        <h4>Notion</h4>
                        <pre>{item.remoteInProcess ? 'En curso' : 'Sin marcar'}</pre>
                      </div>
                    </div>
                    <div className="dialog__actions-btns">
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={resolvingId === item.coursePath}
                        onClick={() =>
                          void resolveWith(
                            item.coursePath,
                            'local',
                            () => window.api.resolveNotionProgress(item.coursePath, 'local'),
                            'No se pudo resolver el progreso',
                            'progress'
                          )
                        }
                      >
                        Usar esta
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={resolvingId === item.coursePath}
                        onClick={() =>
                          void resolveWith(
                            item.coursePath,
                            'remote',
                            () => window.api.resolveNotionProgress(item.coursePath, 'remote'),
                            'No se pudo resolver el progreso',
                            'progress'
                          )
                        }
                      >
                        Usar la de Notion
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            {status?.conflicts?.length ? (
              <div className="notion-sync__deletes">
                <h4>Notas por elegir</h4>
                <p>Cambiaron aquí y en Notion. Elige cuál se queda.</p>
                {status.conflicts.map((item) => (
                  <VersionChoice
                    key={item.findingId}
                    title={item.title || 'Sin título'}
                    localText={[item.title, item.body].filter(Boolean).join('\n\n')}
                    remoteText={[item.remoteTitle, item.remoteBody].filter(Boolean).join('\n\n')}
                    busy={resolvingId === item.findingId}
                    allowBoth
                    onChoose={(choice) =>
                      void resolveWith(
                        item.findingId,
                        choice,
                        () => window.api.resolveNotionConflict(item.findingId, choice),
                        'No se pudo resolver el conflicto'
                      )
                    }
                  />
                ))}
              </div>
            ) : null}
            {status?.playlistConflicts?.length ? (
              <div className="notion-sync__deletes">
                <h4>Listas por elegir</h4>
                <p>Cambiaron aquí y en Notion. El lugar en el tablero se queda en este equipo.</p>
                {status.playlistConflicts.map((item) => (
                  <VersionChoice
                    key={item.playlistId}
                    title={item.title || 'Sin título'}
                    localText={item.localBody}
                    remoteText={[item.remoteTitle, item.remoteBody].filter(Boolean).join('\n\n')}
                    busy={resolvingId === item.playlistId}
                    onChoose={(choice) =>
                      void resolveWith(
                        item.playlistId,
                        choice,
                        () => window.api.resolveNotionPlaylistConflict(item.playlistId, choice),
                        'No se pudo resolver el conflicto',
                        'lista'
                      )
                    }
                  />
                ))}
              </div>
            ) : null}
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
                        disabled={resolvingId === item.findingId}
                        onClick={() =>
                          void resolveWith(
                            item.findingId,
                            'discard',
                            () => window.api.resolveNotionDelete(item.findingId, 'discard'),
                            'No se pudo resolver el borrado'
                          )
                        }
                      >
                        Borrar en Notion
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={resolvingId === item.findingId}
                        onClick={() =>
                          void resolveWith(
                            item.findingId,
                            'keep',
                            () => window.api.resolveNotionDelete(item.findingId, 'keep'),
                            'No se pudo resolver el borrado'
                          )
                        }
                      >
                        Recuperar la de Notion
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            {status?.playlistDeleteConflicts?.length ? (
              <div className="notion-sync__deletes">
                <h4>Listas borradas a medias</h4>
                <p>La lista se borró aquí y Notion cambió después de la última sincronización.</p>
                {status.playlistDeleteConflicts.map((item) => (
                  <article key={item.playlistId}>
                    <strong>{item.title || 'Sin título'}</strong>
                    <pre>{item.remoteBody || item.remoteTitle || 'Sin texto'}</pre>
                    <div className="dialog__actions-btns">
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={resolvingId === item.playlistId}
                        onClick={() =>
                          void resolveWith(
                            item.playlistId,
                            'discard',
                            () => window.api.resolveNotionPlaylistDelete(item.playlistId, 'discard'),
                            'No se pudo resolver el borrado',
                            'lista'
                          )
                        }
                      >
                        Borrar en Notion
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={resolvingId === item.playlistId}
                        onClick={() =>
                          void resolveWith(
                            item.playlistId,
                            'keep',
                            () => window.api.resolveNotionPlaylistDelete(item.playlistId, 'keep'),
                            'No se pudo resolver el borrado',
                            'lista'
                          )
                        }
                      >
                        Recuperar la de Notion
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            <SyncProgress
              status={status}
              active={Boolean(syncingNow || status?.syncing || status?.queued)}
            />
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
