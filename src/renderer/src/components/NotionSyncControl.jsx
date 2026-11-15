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

function progressLabel(status) {
  const total = status?.syncTotal || 0
  const done = status?.syncDone || 0
  if (status?.migrating && status?.prepareTotal) {
    const detail = status.prepareDetail || 'Pasando a filas'
    return `${status.prepareDone} de ${status.prepareTotal} · ${detail}`
  }
  if (status?.syncing && total) return `${done} de ${total}`
  if (status?.prepareDetail) return status.prepareDetail
  const queued = Number(status?.queued) || 0
  if (queued) return queued === 1 ? '1 cambio en espera' : `${queued} cambios en espera`
  return 'Preparando…'
}

function syncLabel(status) {
  if (!status?.enabled) return 'Apagado'
  if (status?.migrating) return 'Migrando'
  if (status?.syncing || status?.queued || status?.prepareDetail) return 'Sincronizando…'
  if (status.lastError) return 'Error'
  return 'Activo'
}

function formatTime(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function sameList(left, right) {
  return (left || []).join('\n') === (right || []).join('\n')
}

function anchorPlace(anchor) {
  const course = String(anchor?.coursePath || '')
    .split(/[/\\]/)
    .filter(Boolean)
    .pop()
  const place =
    anchor?.lessonTitle ||
    anchor?.projectTitle ||
    anchor?.lessonRelativePath ||
    anchor?.projectId ||
    ''
  return [course, place].filter(Boolean).join(' / ')
}

function conflictMetaFromNote(note) {
  const conflict = note?.notion?.conflict || {}
  const topics = Array.isArray(note?.topics) ? note.topics : []
  const name = (id) => topics.find((topic) => topic.id === id)?.title || id
  const localTopics = topics.map((topic) => topic.title).filter(Boolean)
  return noteMeta({
    hasMeta: Array.isArray(conflict.remoteAnchors),
    localColor: note?.color || '',
    remoteColor: conflict.remoteColor || '',
    localTime: typeof note?.timeSec === 'number' ? note.timeSec : null,
    remoteTime: conflict.remoteTimeSec === undefined ? null : conflict.remoteTimeSec,
    localPlaces: (note?.anchors || []).map(anchorPlace).filter(Boolean),
    remotePlaces: (conflict.remoteAnchors || []).map(anchorPlace).filter(Boolean),
    localTopics: localTopics.length ? localTopics : (note?.topicIds || []).map(name),
    remoteTopics: (conflict.remoteTopicIds || []).map(name)
  })
}

function noteMeta(side) {
  if (!side?.hasMeta) return []
  const rows = []
  if ((side.localColor || '') !== (side.remoteColor || '')) {
    rows.push(['Color', side.localColor || 'Sin color', side.remoteColor || 'Sin color'])
  }
  if (side.localTime !== side.remoteTime) {
    rows.push([
      'Momento',
      formatTime(side.localTime) || 'Sin momento',
      formatTime(side.remoteTime) || 'Sin momento'
    ])
  }
  if (!sameList(side.localPlaces, side.remotePlaces)) {
    rows.push([
      'Lugares',
      (side.localPlaces || []).join('\n') || 'Sin lugar',
      (side.remotePlaces || []).join('\n') || 'Sin lugar'
    ])
  }
  if (!sameList(side.localTopics, side.remoteTopics)) {
    rows.push([
      'Temas',
      (side.localTopics || []).join(', ') || 'Sin temas',
      (side.remoteTopics || []).join(', ') || 'Sin temas'
    ])
  }
  return rows
}

function SyncProgress({ status, active }) {
  const total = status?.syncTotal || 0
  const done = status?.syncDone || 0
  const migrating = Boolean(status?.migrating && status?.prepareTotal)
  const scanning = Boolean(status?.prepareDetail && status?.prepareTotal)
  const known = Boolean(migrating || (status?.syncing && total) || scanning)
  const shownTotal = migrating
    ? status.prepareTotal
    : status?.syncing && total
      ? total
      : status?.prepareTotal || 0
  const shownDone = migrating
    ? status.prepareDone
    : status?.syncing && total
      ? done
      : status?.prepareDone || 0
  const percent = known ? Math.min(100, Math.round((shownDone / shownTotal) * 100)) : 0
  const label = progressLabel(status)
  if (!active) return null
  return (
    <div
      className={`notion-sync__progress${known ? '' : ' is-waiting'}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={known ? shownTotal : undefined}
      aria-valuenow={known ? shownDone : undefined}
      aria-label="Sincronización con Notion"
    >
      <span>{label}</span>
      <div className="notion-sync__progress-track">
        <div
          className="notion-sync__progress-fill"
          style={known ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  )
}

function NotionDebug() {
  const [report, setReport] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const text = await window.api.getNotionDebug?.()
    const next = String(text || '')
    setReport(next)
    return next
  }

  const copy = async () => {
    setBusy(true)
    try {
      const text = await load()
      if (!text) throw new Error('El diagnóstico está vacío')
      await navigator.clipboard.writeText(text)
      toast.success('Diagnóstico copiado. Pégalo en el chat.')
    } catch (error) {
      toast.error(notionErrorText(error, 'No se pudo copiar. Selecciona el texto de abajo.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="notion-sync__debug">
      <summary>Depuración</summary>
      <p>
        Muestra si esta biblioteca vio los cambios de Notion. Copia el texto y pégalo en el chat.
      </p>
      <div className="dialog__actions-btns">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => void load()}
        >
          Ver
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => void copy()}
        >
          {busy ? 'Copiando…' : 'Copiar diagnóstico'}
        </button>
      </div>
      {report ? <pre>{report}</pre> : null}
    </details>
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

function MetaDiff({ rows }) {
  if (!rows?.length) return null
  return (
    <div className="notion-conflict__meta">
      {rows.map(([label, localValue, remoteValue]) => (
        <div key={label} className="notion-conflict__cols">
          <div>
            <h4>{label} aquí</h4>
            <pre>{localValue}</pre>
          </div>
          <div>
            <h4>{label} en Notion</h4>
            <pre>{remoteValue}</pre>
          </div>
        </div>
      ))}
    </div>
  )
}

function VersionChoice({ title, localText, remoteText, meta, busy, onChoose, allowBoth = false }) {
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
      <MetaDiff rows={meta} />
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

function ShareScope({ expanded }) {
  const body = (
    <>
      <ul className="notion-sync__scope">
        <li>
          <strong>Notas</strong>
          <span>
            Título, texto, imágenes, color, momento del video, todos los lugares y los temas.
          </span>
        </li>
        <li>
          <strong>Temas</strong>
          <span>Nombre, resumen y alias.</span>
        </li>
        <li>
          <strong>Proyectos</strong>
          <span>Título, estado y breve. La carpeta vinculada se queda en este equipo.</span>
        </li>
        <li>
          <strong>Intención de las listas</strong>
          <span>La meta y los intereses. El lugar en el tablero se queda en este equipo.</span>
        </li>
        <li>
          <strong>Listas</strong>
          <span>
            Título, motivo, cursos y listas anidadas. El lugar en el tablero se queda aquí.
          </span>
        </li>
        <li>
          <strong>Progreso</strong>
          <span>
            En curso, lecciones completadas y la última lección. El punto de reproducción se queda
            en este equipo. Si en curso cambió en los dos lados, eliges cuál se queda. Las lecciones
            completadas se unen.
          </span>
        </li>
      </ul>
      <p className="dialog__lead">
        El título, la academia, el instructor, la descripción y la portada de cada curso siguen en
        su carpeta, igual que los archivos del curso. Si una nota cambió aquí y en Notion, espera a
        que elijas una versión.
      </p>
    </>
  )
  if (expanded) return body
  return (
    <details className="notion-sync__fold">
      <summary>Qué se comparte</summary>
      {body}
    </details>
  )
}

function SavedCredential({ label, value, action }) {
  return (
    <div className="field">
      <span className="notion-sync__label">{label}</span>
      <div className="notion-sync__saved">
        <span>{value}</span>
        <button type="button" className="btn btn--ghost" onClick={action}>
          Cambiar
        </button>
      </div>
    </div>
  )
}

function NotionCredentials({
  status,
  connected,
  token,
  setToken,
  editingToken,
  setEditingToken,
  databaseId,
  setDatabaseId,
  editingDatabase,
  setEditingDatabase
}) {
  const showTokenInput = !connected || !status?.hasToken || editingToken
  const showDatabaseInput = !connected || !status?.databaseId || editingDatabase
  return (
    <>
      {showTokenInput ? (
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
          {connected && status?.hasToken ? (
            <button
              type="button"
              className="btn btn--ghost notion-sync__cancel"
              onClick={() => {
                setToken('')
                setEditingToken(false)
              }}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      ) : (
        <SavedCredential
          label="Token de integración"
          value="Token guardado"
          action={() => setEditingToken(true)}
        />
      )}
      {showDatabaseInput ? (
        <div className="field">
          <label htmlFor="notion-database">Base de datos</label>
          <input
            id="notion-database"
            value={databaseId}
            placeholder="Enlace o id de la base"
            onChange={(event) => setDatabaseId(event.target.value)}
          />
          {connected && status?.databaseId ? (
            <button
              type="button"
              className="btn btn--ghost notion-sync__cancel"
              onClick={() => {
                setDatabaseId(status.databaseId || '')
                setEditingDatabase(false)
              }}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      ) : (
        <SavedCredential
          label="Base de datos"
          value={status.databaseId}
          action={() => setEditingDatabase(true)}
        />
      )}
    </>
  )
}

function NotionSyncAttention({ status, resolvingId, resolveWith, retryingSave }) {
  return (
    <>
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
            El interruptor cambió aquí y en Notion. Las lecciones completadas de los dos lados ya se
            unieron. El punto de reproducción se queda en este equipo.
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
          <p>
            Cambiaron aquí y en Notion. El texto, el color, los lugares y los temas viajan con la
            versión que elijas.
          </p>
          {status.conflicts.map((item) => (
            <VersionChoice
              key={item.findingId}
              title={item.title || 'Sin título'}
              localText={[item.title, item.body].filter(Boolean).join('\n\n')}
              remoteText={[item.remoteTitle, item.remoteBody].filter(Boolean).join('\n\n')}
              meta={noteMeta(item)}
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
    </>
  )
}

export function NotionSyncButton() {
  const status = useNotionSync()
  const dialogRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [databaseId, setDatabaseId] = useState('')
  const [editingToken, setEditingToken] = useState(false)
  const [editingDatabase, setEditingDatabase] = useState(false)
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
    setEditingToken(false)
    setEditingDatabase(false)
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
      setEditingToken(false)
      setEditingDatabase(false)
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
  const retryingSave =
    status?.lastErrorCode === 'conflict_error' && (status.syncing || status.queued)
  const connected = Boolean(status?.enabled)
  const settingsDirty =
    Boolean(token.trim()) || databaseId.trim() !== String(status?.databaseId || '').trim()
  const syncBusy = Boolean(syncingNow || status?.syncing || status?.queued || status?.migrating)

  const turnOff = () => {
    if (syncBusy && !window.confirm('¿Apagar Notion? La sincronización en curso se detiene.'))
      return
    void save(false)
  }

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
              if (connected && !settingsDirty) return
              void save(true)
            }}
          >
            <h3>Notion</h3>
            {connected ? null : (
              <>
                <p className="dialog__lead">
                  Conecta esta biblioteca con una base de Notion. Otra copia de la app que use la
                  misma base comparte lo que se guarda aquí.
                </p>
                <ShareScope expanded />
              </>
            )}
            <p className="notion-sync__enable">
              {connected ? 'Esta biblioteca está conectada.' : 'Esta biblioteca está desconectada.'}
            </p>
            {status?.migrating ? (
              <p className="dialog__lead">
                La base se está pasando a filas. Las notas siguen en esta biblioteca.
              </p>
            ) : null}
            {connected ? <SyncProgress status={status} active={syncBusy} /> : null}
            {connected ? (
              <NotionSyncAttention
                status={status}
                resolvingId={resolvingId}
                resolveWith={resolveWith}
                retryingSave={retryingSave}
              />
            ) : null}
            {connected ? <ShareScope expanded={false} /> : null}
            <NotionCredentials
              status={status}
              connected={connected}
              token={token}
              setToken={setToken}
              editingToken={editingToken}
              setEditingToken={setEditingToken}
              databaseId={databaseId}
              setDatabaseId={setDatabaseId}
              editingDatabase={editingDatabase}
              setEditingDatabase={setEditingDatabase}
            />
            {connected ? null : (
              <NotionSyncAttention
                status={status}
                resolvingId={resolvingId}
                resolveWith={resolveWith}
                retryingSave={retryingSave}
              />
            )}
            <NotionDebug />
            {connected ? null : <SyncProgress status={status} active={syncBusy} />}
            <div className="dialog__actions dialog__actions--spread">
              <button type="button" className="btn btn--ghost" onClick={close}>
                Cerrar
              </button>
              <div className="dialog__actions-btns">
                {connected ? (
                  <button
                    type="button"
                    className={settingsDirty ? 'btn btn--ghost' : 'btn btn--primary'}
                    disabled={syncingNow || status.syncing || status.migrating}
                    onClick={() => void syncAll()}
                  >
                    {syncingNow || status.syncing || status.migrating
                      ? 'Sincronizando…'
                      : 'Sincronizar ahora'}
                  </button>
                ) : null}
                {connected ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={saving}
                    onClick={turnOff}
                  >
                    Apagar
                  </button>
                ) : null}
                {!connected || settingsDirty ? (
                  <button type="submit" className="btn btn--primary" disabled={saving}>
                    {saving ? 'Guardando…' : connected ? 'Guardar' : 'Activar'}
                  </button>
                ) : null}
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
            Los dos lados cambiaron desde la última sincronización. Elige cuál se queda. El texto,
            el color, los lugares, los temas y el momento del video viajan con esa versión.
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
          <MetaDiff rows={conflictMetaFromNote(note)} />
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
