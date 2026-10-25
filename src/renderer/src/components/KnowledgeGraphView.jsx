import { useEffect, useRef, useState } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation
} from 'd3-force'

const FILL = {
  finding: '#e84570',
  topic: '#3d7a7a',
  course: '#6b6578'
}

/**
 * Local graph in the Logseq / Obsidian pattern: circles, labels, and lines.
 * A force simulation pulls linked nodes together. Dragging a node rearranges the rest.
 * The open node stays pinned at the center until you drag it.
 */
function KnowledgeGraphView({ nodes = [], edges = [], truncated = false, onNodeClick }) {
  const hostRef = useRef(null)
  const simRef = useRef(null)
  const nodesRef = useRef([])
  const linksRef = useRef([])
  const cameraRef = useRef({ x: 0, y: 0, k: 1 })
  const dragRef = useRef(null)
  const [size, setSize] = useState({ width: 320, height: 480 })
  const [tick, setTick] = useState(0)
  const [camera, setCamera] = useState({ x: 0, y: 0, k: 1 })
  const [hoverId, setHoverId] = useState(null)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width < 40 || height < 40) return
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const { width, height } = size
    const simNodes = nodes.map((node, index) => {
      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2
      return {
        id: node.id,
        kind: node.data?.kind || 'finding',
        label: node.data?.label || '',
        refId: node.data?.refId,
        active: Boolean(node.data?.active),
        r: node.data?.active ? 8 : node.data?.kind === 'course' ? 4.5 : 6,
        x: width / 2 + Math.cos(angle) * 48,
        y: height / 2 + Math.sin(angle) * 48
      }
    })
    const ids = new Set(simNodes.map((node) => node.id))
    const focus = simNodes.find((node) => node.active)
    if (focus) {
      focus.fx = width / 2
      focus.fy = height / 2
    }
    const simLinks = edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({ source: edge.source, target: edge.target }))
    nodesRef.current = simNodes
    linksRef.current = simLinks
    setHoverId(null)
    cameraRef.current = { x: 0, y: 0, k: 1 }
    setCamera({ x: 0, y: 0, k: 1 })
    setTick((value) => value + 1)

    let simulation
    try {
      simulation = forceSimulation(simNodes)
        .force(
          'link',
          forceLink(simLinks)
            .id((node) => node.id)
            .distance(78)
            .strength(0.6)
        )
        .force('charge', forceManyBody().strength(-280))
        .force('center', forceCenter(width / 2, height / 2))
        .force(
          'collide',
          forceCollide().radius((node) => node.r + 18)
        )
        .alpha(1)
        .on('tick', () => {
          nodesRef.current = simNodes
          linksRef.current = simLinks
          setTick((value) => value + 1)
        })
    } catch (err) {
      console.error(err)
      return undefined
    }

    simRef.current = simulation
    return () => simulation.stop()
  }, [nodes, edges, size.width, size.height])

  const toGraph = (event) => {
    const rect = hostRef.current.getBoundingClientRect()
    const { x, y, k } = cameraRef.current
    return {
      x: (event.clientX - rect.left - x) / k,
      y: (event.clientY - rect.top - y) / k
    }
  }

  const pinFocus = () => {
    const focus = nodesRef.current.find((node) => node.active)
    if (!focus) return
    focus.fx = size.width / 2
    focus.fy = size.height / 2
  }

  const onBackgroundDown = (event) => {
    if (event.target !== event.currentTarget) return
    const origin = { x: event.clientX, y: event.clientY, cam: { ...cameraRef.current } }
    dragRef.current = { type: 'pan', origin, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onNodeDown = (event, node) => {
    event.stopPropagation()
    const point = toGraph(event)
    node.fx = point.x
    node.fy = point.y
    dragRef.current = {
      type: 'node',
      node,
      moved: false,
      x: event.clientX,
      y: event.clientY
    }
    simRef.current?.alphaTarget(0.35).restart()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.type === 'pan') {
      const dx = event.clientX - drag.origin.x
      const dy = event.clientY - drag.origin.y
      if (Math.hypot(dx, dy) > 3) drag.moved = true
      const next = { ...drag.origin.cam, x: drag.origin.cam.x + dx, y: drag.origin.cam.y + dy }
      cameraRef.current = next
      setCamera(next)
      return
    }
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) drag.moved = true
    const point = toGraph(event)
    drag.node.fx = point.x
    drag.node.fy = point.y
    simRef.current?.alpha(0.35).restart()
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || drag.type !== 'node') return
    if (!drag.moved) onNodeClick?.(nodes.find((node) => node.id === drag.node.id))
    if (drag.node.active) pinFocus()
    else {
      drag.node.fx = null
      drag.node.fy = null
    }
    simRef.current?.alphaTarget(0).alpha(0.45).restart()
  }

  useEffect(() => {
    const el = hostRef.current
    if (!el) return undefined
    const wheel = (event) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const prev = cameraRef.current
      const nextK = Math.min(2.4, Math.max(0.35, prev.k * (event.deltaY > 0 ? 0.92 : 1.08)))
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      const next = {
        k: nextK,
        x: mx - ((mx - prev.x) * nextK) / prev.k,
        y: my - ((my - prev.y) * nextK) / prev.k
      }
      cameraRef.current = next
      setCamera(next)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const drawnNodes = nodesRef.current
  const drawnLinks = linksRef.current
  const hoverNeighbors = (() => {
    if (!hoverId || !drawnNodes.some((node) => node.id === hoverId)) return null
    const set = new Set([hoverId])
    for (const link of drawnLinks) {
      const source = link.source?.id || link.source
      const target = link.target?.id || link.target
      if (source === hoverId) set.add(target)
      if (target === hoverId) set.add(source)
    }
    return set
  })()

  return (
    <div
      className="knowledge-graph"
      ref={hostRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {!nodes.length ? (
        <div className="knowledge-graph--empty">
          <p>Selecciona una anotación. Las referencias se dibujan aquí.</p>
        </div>
      ) : (
        <svg
          className="knowledge-graph__svg"
          viewBox={`0 0 ${size.width} ${size.height}`}
          onPointerDown={onBackgroundDown}
          data-tick={tick}
        >
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
            {drawnLinks.map((link) => {
              const source = link.source
              const target = link.target
              if (typeof source?.x !== 'number' || typeof target?.x !== 'number') return null
              const hot =
                !hoverNeighbors ||
                (hoverNeighbors.has(source.id) && hoverNeighbors.has(target.id))
              return (
                <line
                  key={`${source.id}->${target.id}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  className={`knowledge-graph__link${hot ? ' is-hot' : ' is-dim'}`}
                />
              )
            })}
            {drawnNodes.map((node) => {
              const dim = hoverNeighbors && !hoverNeighbors.has(node.id)
              return (
                <g
                  key={node.id}
                  className={`knowledge-graph__node${node.active ? ' is-active' : ''}${dim ? ' is-dim' : ''}`}
                  transform={`translate(${node.x || 0} ${node.y || 0})`}
                  onPointerDown={(event) => onNodeDown(event, node)}
                  onPointerEnter={() => setHoverId(node.id)}
                  onPointerLeave={() => setHoverId((current) => (current === node.id ? null : current))}
                >
                  <circle r={node.r} fill={FILL[node.kind] || FILL.finding} />
                  <text x={node.r + 6} y={4}>
                    {node.label}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      )}
      {truncated ? <p className="knowledge-graph__note">Mostrando los vecinos más cercanos.</p> : null}
    </div>
  )
}

export default KnowledgeGraphView
