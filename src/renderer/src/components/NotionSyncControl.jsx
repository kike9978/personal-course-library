import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { cn } from '../ui/cn'
import {
  btnGhost,
  btnPrimary,
  dialogShell as dialogBase,
  dialogBody,
  dialogLead as sharedDialogLead, menuItem as sharedMenuItem } from '../ui/classes'

const dialogBox = cn(dialogBase, 'max-w-[460px]')
const notionDialog = cn(
  dialogBox,
  'max-h-[min(90vh,48rem)] max-w-[40rem] overflow-auto [&_[data-cols]]:!grid-cols-1'
)
const dialogForm = cn(dialogBody, '[&_h3]:m-0 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-bold [&_h3]:tracking-tight')
const dialogLead = sharedDialogLead
const actionsSpread = 'flex flex-wrap items-center justify-between gap-3 pt-[0.35rem]'
const actionsBtns = 'flex gap-2'
const field =
  '[&_label]:mb-[0.3rem] [&_label]:block [&_label]:text-xs [&_label]:font-semibold [&_label]:tracking-[0.04em] [&_label]:text-ink-soft [&_label]:uppercase [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-ink/10 [&_input]:bg-surface [&_input]:px-3 [&_input]:py-[0.65rem] [&_input]:text-ink [&_input]:shadow-none [&_input]:outline-none [&_input]:focus:shadow-focus'
const credentialLabel =
  'mb-[0.3rem] block text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase'
const cols = 'grid grid-cols-2 gap-3 max-[720px]:grid-cols-1'
const block =
  'flex flex-col gap-[0.65rem] rounded-md border border-ink/10 bg-surface p-[0.85rem] [&_h3]:m-0 [&_h3]:font-display [&_h4]:m-0 [&_h4]:font-display [&_p]:m-0 [&_p]:text-base [&_p]:text-ink-soft [&_pre]:mt-[0.35rem] [&_pre]:mb-0 [&_pre]:max-h-[12rem] [&_pre]:overflow-auto [&_pre]:font-body [&_pre]:text-sm [&_pre]:whitespace-pre-wrap [&_pre]:text-ink'
const conflictCard = cn(block, 'mb-4')
const deletes = 'flex flex-col gap-3 [&_h4]:m-0 [&_h4]:font-display [&_p]:m-0 [&_p]:text-base [&_p]:text-ink-soft'
const scopeList =
  'mt-[0.2rem] flex list-none flex-col gap-[0.65rem] p-0 [&_li]:flex [&_li]:flex-col [&_li]:gap-[0.15rem] [&_li]:rounded-md [&_li]:border [&_li]:border-ink/10 [&_li]:bg-surface [&_li]:px-[0.8rem] [&_li]:py-[0.7rem] [&_strong]:font-display [&_span]:text-sm [&_span]:leading-[1.4] [&_span]:text-ink-soft'
const fold =
  'flex flex-col gap-3 rounded-md border border-ink/10 bg-surface p-[0.85rem] [&_summary]:cursor-pointer [&_summary]:font-display [&_summary]:font-semibold'
const debugBox =
  'flex flex-col gap-3 rounded-md border border-ink/10 bg-surface p-[0.85rem] [&_summary]:cursor-pointer [&_summary]:font-display [&_summary]:font-semibold [&_p]:m-0 [&_p]:text-base [&_p]:text-ink-soft [&_pre]:m-0 [&_pre]:max-h-[16rem] [&_pre]:overflow-auto [&_pre]:font-body [&_pre]:text-xs [&_pre]:whitespace-pre-wrap [&_pre]:text-ink'
const menuItem = sharedMenuItem
const cancelBtn = cn(btnGhost, 'mt-[0.45rem]')

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
      className="flex flex-col gap-[0.35rem] [&_span]:text-xs [&_span]:font-semibold [&_span]:text-ink-soft"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={known ? shownTotal : undefined}
      aria-valuenow={known ? shownDone : undefined}
      aria-label="Sincronización con Notion"
    >
      <span>{label}</span>
      <div className="h-[0.45rem] overflow-hidden rounded-full border border-ink/10 bg-cream-deep">
        <div
          className={cn(
            'h-full rounded-[inherit] bg-coral transition-[width] duration-150 ease-pop',
            !known &&
              'w-[35%] animate-notion-wait motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-45'
          )}
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
    <details className={debugBox}>
      <summary>Depuración</summary>
      <p>
        Muestra si esta biblioteca vio los cambios de Notion. Copia el texto y pégalo en el chat.
      </p>
      <div className={actionsBtns}>
        <button
          type="button"
          className={btnGhost}
          disabled={busy}
          onClick={() => void load()}
        >
          Ver
        </button>
        <button
          type="button"
          className={btnPrimary}
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
  if (choice === 'local' && kind === 'notas') return 'Quedaron las notas de esta biblioteca'
  if (choice === 'local' && kind === 'progress') return 'En curso se quedó como en esta biblioteca'
  if (choice === 'remote' && kind === 'progress') return 'En curso se quedó como en Notion'
  if (choice === 'json') return 'Los dibujos se comparten como JSON'
  if (choice === 'image') return 'Se comparte solo la imagen del dibujo'
  if (choice === 'local' && kind === 'dibujo') return 'Los dibujos se quedan en esta biblioteca'
  if (choice === 'both') return 'La versión de Notion quedó en una nota nueva'
  if (choice === 'local' && kind === 'proyecto') return 'Quedó el proyecto de esta biblioteca'
  if (choice === 'remote' && kind === 'proyecto') return 'Quedó el proyecto de Notion'
  if (choice === 'local' && kind === 'fuente') return 'Quedó la fuente de esta biblioteca'
  if (choice === 'local' && kind === 'colección') return 'Quedó la colección de esta biblioteca'
  if (choice === 'remote' && kind === 'colección') return 'Quedó la colección de Notion'
  if (choice === 'remote' && kind === 'fuente') return 'Quedó la fuente de Notion'
  if (choice === 'remote') return 'Quedó el texto de Notion'
  if (choice === 'keep') {
    if (kind === 'lista') return 'Lista recuperada desde Notion'
    if (kind === 'proyecto') return 'Proyecto recuperado desde Notion'
    if (kind === 'fuente') return 'Fuente recuperada desde Notion'
    if (kind === 'colección') return 'Colección recuperada desde Notion'
    return 'Nota recuperada desde Notion'
  }
  if (choice === 'discard') return 'Página borrada en Notion'
  return 'Quedó el texto de aquí'
}

function MetaDiff({ rows }) {
  if (!rows?.length) return null
  return (
    <div className="flex flex-col gap-[0.65rem]">
      {rows.map(([label, localValue, remoteValue]) => (
        <div key={label} data-cols className={cols}>
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
    <article className={block}>
      <strong>{title}</strong>
      <div data-cols className={cols}>
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
      <div className={actionsBtns}>
        <button
          type="button"
          className={btnPrimary}
          disabled={busy}
          onClick={() => onChoose('local')}
        >
          Usar esta
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={busy}
          onClick={() => onChoose('remote')}
        >
          Usar la de Notion
        </button>
        {allowBoth ? (
          <button
            type="button"
            className={btnGhost}
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
      <ul className={scopeList}>
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
      <p className={dialogLead}>
        El título, la academia, el instructor, la descripción y la portada de cada curso siguen en
        su carpeta, igual que los archivos del curso. Si una nota cambió aquí y en Notion, espera a
        que elijas una versión.
      </p>
    </>
  )
  if (expanded) return body
  return (
    <details className={fold}>
      <summary>Qué se comparte</summary>
      {body}
    </details>
  )
}

function SavedCredential({ label, value, action }) {
  return (
    <div className={field}>
      <span className={credentialLabel}>{label}</span>
      <div className="flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-surface py-[0.45rem] pr-[0.55rem] pl-3 [&>span]:min-w-0 [&>span]:truncate">
        <span>{value}</span>
        <button type="button" className={btnGhost} onClick={action}>
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
        <div className={field}>
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
              className={cancelBtn}
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
        <div className={field}>
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
              className={cancelBtn}
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
        <p className="m-0 text-sm text-coral-deep">
          {status.lastError}
          {retryingSave ? ' Se vuelve a intentar.' : ''}
          {status.lastErrorCode === 'conflict_error' && !retryingSave
            ? ' Sincronizar ahora lo vuelve a intentar.'
            : ''}
        </p>
      ) : null}
      {status?.progressConflicts?.length ? (
        <div className={deletes}>
          <h4>En curso por elegir</h4>
          <p>
            El interruptor cambió aquí y en Notion. Las lecciones completadas de los dos lados ya se
            unieron. El punto de reproducción se queda en este equipo.
          </p>
          {status.progressConflicts.map((item) => (
            <article className={block} key={item.coursePath}>
              <strong>{item.title || item.coursePath}</strong>
              <div data-cols className={cols}>
                <div>
                  <h4>Esta biblioteca</h4>
                  <pre>{item.localInProcess ? 'En curso' : 'Sin marcar'}</pre>
                </div>
                <div>
                  <h4>Notion</h4>
                  <pre>{item.remoteInProcess ? 'En curso' : 'Sin marcar'}</pre>
                </div>
              </div>
              <div className={actionsBtns}>
                <button
                  type="button"
                  className={btnPrimary}
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
                  className={btnGhost}
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
        <div className={deletes}>
          <h4>Notas por elegir</h4>
          <p>
            Cambiaron aquí y en Notion. El texto, el color, los lugares y los temas viajan con la
            versión que elijas.
          </p>
          <div className={actionsBtns}>
            <button
              type="button"
              className={btnPrimary}
              disabled={Boolean(resolvingId)}
              onClick={() =>
                void resolveWith(
                  'all-notes',
                  'local',
                  () => window.api.resolveAllLocalNoteConflicts(),
                  'No se pudieron usar las notas de esta biblioteca',
                  'notas'
                )
              }
            >
              Usar todas las de esta biblioteca
            </button>
          </div>
          {status.conflicts.map((item) => (
            <VersionChoice
              key={item.findingId}
              title={item.title || 'Sin título'}
              localText={item.body}
              remoteText={item.remoteBody}
              meta={noteMeta(item)}
              busy={Boolean(resolvingId)}
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
      {status?.projectConflicts?.length ? (
        <div className={deletes}>
          <h4>Proyectos por elegir</h4>
          <p>
            Cambiaron aquí y en Notion. El título, el estado y el breve viajan con la versión que
            elijas. La carpeta vinculada se queda en este equipo.
          </p>
          {status.projectConflicts.map((item) => (
            <VersionChoice
              key={item.projectId}
              title={item.title || 'Proyecto'}
              localText={item.localBody}
              remoteText={[item.remoteTitle, item.remoteBody].filter(Boolean).join('\n\n')}
              busy={resolvingId === item.projectId}
              onChoose={(choice) =>
                void resolveWith(
                  item.projectId,
                  choice,
                  () => window.api.resolveNotionProjectConflict(item.projectId, choice),
                  'No se pudo resolver el conflicto',
                  'proyecto'
                )
              }
            />
          ))}
        </div>
      ) : null}
      {status?.collectionConflicts?.length ? (
        <div className={deletes}>
          <h4>Colecciones por elegir</h4>
          <p>Cambiaron aquí y en Notion. El nombre, el orden y las notas cortas viajan con la versión que elijas.</p>
          {status.collectionConflicts.map((item) => (
            <VersionChoice
              key={item.collectionId}
              title={item.title || 'Colección'}
              localText={item.localBody}
              remoteText={[item.remoteTitle, item.remoteBody].filter(Boolean).join('\n\n')}
              busy={resolvingId === item.collectionId}
              onChoose={(choice) =>
                void resolveWith(
                  item.collectionId,
                  choice,
                  () => window.api.resolveNotionCollectionConflict(item.collectionId, choice),
                  'No se pudo resolver el conflicto',
                  'colección'
                )
              }
            />
          ))}
        </div>
      ) : null}
      {status?.collectionDeleteConflicts?.length ? (
        <div className={deletes}>
          <h4>Colecciones borradas a medias</h4>
          <p>La colección se borró aquí y Notion cambió después de la última sincronización.</p>
          {status.collectionDeleteConflicts.map((item) => (
            <article className={block} key={item.collectionId}>
              <strong>{item.title || 'Colección'}</strong>
              <pre>{item.remoteBody || item.remoteTitle || 'Sin texto'}</pre>
              <div className={actionsBtns}>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={resolvingId === item.collectionId}
                  onClick={() =>
                    void resolveWith(
                      item.collectionId,
                      'discard',
                      () => window.api.resolveNotionCollectionDelete(item.collectionId, 'discard'),
                      'No se pudo resolver el borrado',
                      'colección'
                    )
                  }
                >
                  Borrar en Notion
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={resolvingId === item.collectionId}
                  onClick={() =>
                    void resolveWith(
                      item.collectionId,
                      'keep',
                      () => window.api.resolveNotionCollectionDelete(item.collectionId, 'keep'),
                      'No se pudo resolver el borrado',
                      'colección'
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
      {status?.sourceConflicts?.length ? (
        <div className={deletes}>
          <h4>Fuentes por elegir</h4>
          <p>
            Cambiaron aquí y en Notion. El título, el enlace, el estado y los temas viajan con la
            versión que elijas. La posición del video y las capturas se quedan en este equipo.
          </p>
          {status.sourceConflicts.map((item) => (
            <VersionChoice
              key={item.sourceId}
              title={item.title || 'Enlace'}
              localText={item.localBody}
              remoteText={[item.remoteTitle, item.remoteBody].filter(Boolean).join('\n\n')}
              busy={resolvingId === item.sourceId}
              onChoose={(choice) =>
                void resolveWith(
                  item.sourceId,
                  choice,
                  () => window.api.resolveNotionSourceConflict(item.sourceId, choice),
                  'No se pudo resolver el conflicto',
                  'fuente'
                )
              }
            />
          ))}
        </div>
      ) : null}
      {status?.playlistConflicts?.length ? (
        <div className={deletes}>
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
        <div className={deletes}>
          <h4>Borrados a medias</h4>
          <p>La nota se borró aquí y Notion cambió después de la última sincronización.</p>
          {status.deleteConflicts.map((item) => (
            <article className={block} key={item.findingId}>
              <strong>{item.title || 'Sin título'}</strong>
              <pre>{item.remoteBody || item.remoteTitle || 'Sin texto'}</pre>
              <div className={actionsBtns}>
                <button
                  type="button"
                  className={btnGhost}
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
                  className={btnPrimary}
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
      {status?.projectDeleteConflicts?.length ? (
        <div className={deletes}>
          <h4>Proyectos borrados a medias</h4>
          <p>El proyecto se borró aquí y Notion cambió después de la última sincronización.</p>
          {status.projectDeleteConflicts.map((item) => (
            <article className={block} key={item.projectId}>
              <strong>{item.title || 'Proyecto'}</strong>
              <pre>{item.remoteBody || item.remoteTitle || 'Sin texto'}</pre>
              <div className={actionsBtns}>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={resolvingId === item.projectId}
                  onClick={() =>
                    void resolveWith(
                      item.projectId,
                      'discard',
                      () => window.api.resolveNotionProjectDelete(item.projectId, 'discard'),
                      'No se pudo resolver el borrado',
                      'proyecto'
                    )
                  }
                >
                  Borrar en Notion
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={resolvingId === item.projectId}
                  onClick={() =>
                    void resolveWith(
                      item.projectId,
                      'keep',
                      () => window.api.resolveNotionProjectDelete(item.projectId, 'keep'),
                      'No se pudo resolver el borrado',
                      'proyecto'
                    )
                  }
                >
                  Recuperar el de Notion
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {status?.sourceDeleteConflicts?.length ? (
        <div className={deletes}>
          <h4>Fuentes borradas a medias</h4>
          <p>La fuente se borró aquí y Notion cambió después de la última sincronización.</p>
          {status.sourceDeleteConflicts.map((item) => (
            <article className={block} key={item.sourceId}>
              <strong>{item.title || 'Enlace'}</strong>
              <pre>{item.remoteBody || item.remoteTitle || 'Sin texto'}</pre>
              <div className={actionsBtns}>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={resolvingId === item.sourceId}
                  onClick={() =>
                    void resolveWith(
                      item.sourceId,
                      'discard',
                      () => window.api.resolveNotionSourceDelete(item.sourceId, 'discard'),
                      'No se pudo resolver el borrado',
                      'fuente'
                    )
                  }
                >
                  Borrar en Notion
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={resolvingId === item.sourceId}
                  onClick={() =>
                    void resolveWith(
                      item.sourceId,
                      'keep',
                      () => window.api.resolveNotionSourceDelete(item.sourceId, 'keep'),
                      'No se pudo resolver el borrado',
                      'fuente'
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
        <div className={deletes}>
          <h4>Listas borradas a medias</h4>
          <p>La lista se borró aquí y Notion cambió después de la última sincronización.</p>
          {status.playlistDeleteConflicts.map((item) => (
            <article className={block} key={item.playlistId}>
              <strong>{item.title || 'Sin título'}</strong>
              <pre>{item.remoteBody || item.remoteTitle || 'Sin texto'}</pre>
              <div className={actionsBtns}>
                <button
                  type="button"
                  className={btnGhost}
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
                  className={btnPrimary}
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
    (status?.projectConflicts?.length || 0) +
    (status?.projectDeleteConflicts?.length || 0) +
    (status?.sourceConflicts?.length || 0) +
    (status?.collectionConflicts?.length || 0) +
    (status?.collectionDeleteConflicts?.length || 0) +
    (status?.sourceDeleteConflicts?.length || 0) +
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
        className={cn(
          btnGhost,
          'h-8 gap-2 px-2.5 shadow-none [&_small]:text-xs [&_small]:font-normal',
          status?.lastError
            ? '[&_small]:text-coral-deep'
            : '[&_small]:text-ink-soft'
        )}
        onClick={() => setOpen(true)}
        title={status?.lastError || 'Conectar la biblioteca con Notion'}
      >
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            status?.lastError ? 'bg-coral' : status?.enabled ? 'bg-teal' : 'bg-ink/20'
          )}
          aria-hidden="true"
        />
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
          className={notionDialog}
          onClick={(event) => {
            if (event.target === dialogRef.current) close()
          }}
          onClose={close}
        >
          <form
            className={dialogForm}
            onSubmit={(event) => {
              event.preventDefault()
              if (connected && !settingsDirty) return
              void save(true)
            }}
          >
            <h3>Notion</h3>
            {connected ? null : (
              <>
                <p className={dialogLead}>
                  Conecta esta biblioteca con una base de Notion. Otra copia de la app que use la
                  misma base comparte lo que se guarda aquí.
                </p>
                <ShareScope expanded />
              </>
            )}
            <p className="flex items-center gap-2 font-semibold">
              {connected ? 'Esta biblioteca está conectada.' : 'Esta biblioteca está desconectada.'}
            </p>
            {status?.migrating ? (
              <p className={dialogLead}>
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
            <div className={actionsSpread}>
              <button type="button" className={btnGhost} onClick={close}>
                Cerrar
              </button>
              <div className={actionsBtns}>
                {connected ? (
                  <button
                    type="button"
                    className={settingsDirty ? btnGhost : btnPrimary}
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
                    className={btnGhost}
                    disabled={saving}
                    onClick={turnOff}
                  >
                    Apagar
                  </button>
                ) : null}
                {!connected || settingsDirty ? (
                  <button type="submit" className={btnPrimary} disabled={saving}>
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
        <p className="m-0 text-sm text-coral-deep">{note.notion.error}</p>
      ) : null}
      {conflict ? (
        <section className={conflictCard} aria-label="Conflicto con Notion">
          <h3>Esta nota y Notion se separaron</h3>
          <p>
            Los dos lados cambiaron desde la última sincronización. Elige cuál se queda. El texto,
            el color, los lugares, los temas y el momento del video viajan con esa versión.
          </p>
          {dirty ? (
            <p>El editor tiene cambios sin guardar. Usar esta guarda ese texto y lo envía.</p>
          ) : null}
          <div data-cols className={cols}>
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
          <div className={actionsBtns}>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={() => void choose('local')}
            >
              Usar esta
            </button>
            <button
              type="button"
              className={btnGhost}
              disabled={busy}
              onClick={() => void choose('remote')}
            >
              Usar la de Notion
            </button>
            <button
              type="button"
              className={btnGhost}
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

export function NotionSyncNoteButton({ findingId, variant = 'button', onDone }) {
  const status = useNotionSync()
  if (!status?.enabled || !findingId) return null
  const blocked = status.conflicts?.some((item) => item.findingId === findingId)
  const title = blocked ? 'Elige una versión antes de sincronizar' : 'Sincronizar esta anotación'
  const run = () => {
    onDone?.()
    window.api.syncNotionNow(findingId).catch((error) => {
      toast.error(notionErrorText(error, 'No se pudo sincronizar'))
    })
  }
  if (variant === 'menu') {
    return (
      <button
        type="button"
        className={menuItem}
        role="menuitem"
        disabled={status.syncing || blocked}
        title={title}
        onClick={run}
      >
        <span>{status.syncing ? 'Sincronizando…' : 'Sincronizar'}</span>
        {blocked ? <small>Elige una versión antes de sincronizar</small> : null}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={btnGhost}
      disabled={status.syncing || blocked}
      title={title}
      onClick={run}
    >
      Sincronizar
    </button>
  )
}
