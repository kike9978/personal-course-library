import { useEffect, useRef, useState } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import { LABEL_ZOOM, clampLabelZoom, clampLinkDistance } from '../../../shared/knowledgeGraph.js'

const FILL = {
  finding: '#e84570',
  topic: '#3d7a7a',
  course: '#c47b2d',
  file: '#6a4c9c'
}

function radiusFor(kind, selected, scale = 1) {
  const base = kind === 'topic' ? 8 : kind === 'file' || kind === 'course' ? 6.5 : 5
  return (selected ? base + 1.5 : base) * scale
}

function segment(from, to, padStart, padEnd) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const start = Math.min(padStart, length / 2)
  const end = Math.min(padEnd, length / 2)
  return {
    x1: from.x + (dx / length) * start,
    y1: from.y + (dy / length) * start,
    x2: to.x - (dx / length) * end,
    y2: to.y - (dy / length) * end
  }
}

function fitTransform(points, width, height) {
  if (!points.length || width < 40 || height < 40) {
    return { x: width / 2, y: height / 2, k: 1 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  const boxWidth = Math.max(maxX - minX, 48)
  const boxHeight = Math.max(maxY - minY, 48)
  const k = Math.min(2.2, Math.max(0.35, Math.min((width - 56) / boxWidth, (height - 56) / boxHeight)))
  return {
    k,
    x: width / 2 - ((minX + maxX) / 2) * k,
    y: height / 2 - ((minY + maxY) / 2) * k
  }
}

/**
 * One library graph. Positions stay in refs; pan, zoom, drag, and the topics
 * force pass write the SVG on animation frames.
 */
function KnowledgeGraphView({
  nodes = [],
  edges = [],
  viewMode = 'topics',
  linkDistance = 72,
  nodeScale = 1,
  showArrows = false,
  showLabels = true,
  labelZoom = LABEL_ZOOM,
  showCourses = true,
  showFiles = true,
  showOrphans = true,
  highlightIds = null,
  selectedId = null,
  truncated = false,
  resetToken = 0,
  onNodeClick,
  onNodeActivate,
  onNodeShift,
  onClear
}) {
  const hostRef = useRef(null)
  const svgRef = useRef(null)
  const worldRef = useRef(null)
  const positionsRef = useRef(new Map())
  const settledRef = useRef(new Map())
  const nodeElsRef = useRef(new Map())
  const lineElsRef = useRef(new Map())
  const labelElsRef = useRef(new Map())
  const cameraRef = useRef({ x: 0, y: 0, k: 1 })
  const dragRef = useRef(null)
  const clickTimerRef = useRef(0)
  const simRef = useRef(null)
  const allowFitRef = useRef(true)
  const animatingRef = useRef(false)
  const selectedRef = useRef(selectedId)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const [size, setSize] = useState({ width: 320, height: 480 })
  const sizeRef = useRef(size)
  const reachRef = useRef(220)
  const nodeScaleRef = useRef(nodeScale)
  const showArrowsRef = useRef(showArrows)
  const labelZoomRef = useRef(clampLabelZoom(labelZoom))
  sizeRef.current = size
  nodeScaleRef.current = nodeScale
  showArrowsRef.current = showArrows
  labelZoomRef.current = clampLabelZoom(labelZoom)
  const [hoverId, setHoverId] = useState(null)
  const [layoutEpoch, setLayoutEpoch] = useState(0)

  selectedRef.current = selectedId
  nodesRef.current = nodes
  edgesRef.current = edges

  const layoutKey = [
    viewMode,
    clampLinkDistance(linkDistance),
    nodes.map((node) => `${node.id}@${node.x},${node.y}`).join(';'),
    edges.map((edge) => edge.id).join(';')
  ].join('|')

  const visibleKey = nodes.length

  const pointOf = (id, fallback) => positionsRef.current.get(id) || fallback

  const applyCamera = () => {
    const { x, y, k } = cameraRef.current
    worldRef.current?.setAttribute('transform', `translate(${x} ${y}) scale(${k})`)
    svgRef.current?.classList.toggle('is-detailed', k >= labelZoomRef.current)
  }

  useEffect(() => {
    svgRef.current?.classList.toggle('is-detailed', cameraRef.current.k >= labelZoomRef.current)
  }, [labelZoom])

  const paintGeometry = () => {
    const selected = selectedRef.current
    for (const node of nodesRef.current) {
      const point = pointOf(node.id, node)
      nodeElsRef.current.get(node.id)?.setAttribute('transform', `translate(${point.x} ${point.y})`)
    }
    for (const edge of edgesRef.current) {
      const sourceNode = nodesRef.current.find((node) => node.id === edge.source)
      const targetNode = nodesRef.current.find((node) => node.id === edge.target)
      if (!sourceNode || !targetNode) continue
      const source = pointOf(edge.source, sourceNode)
      const target = pointOf(edge.target, targetNode)
      const arrow =
        showArrowsRef.current &&
        (edge.edgeType === 'topic' ||
          edge.edgeType === 'file' ||
          edge.edgeType === 'course' ||
          edge.edgeType === 'link')
      const line = segment(
        source,
        target,
        radiusFor(sourceNode.data?.kind, edge.source === selected, nodeScaleRef.current) + 2,
        radiusFor(targetNode.data?.kind, edge.target === selected, nodeScaleRef.current) +
          (arrow ? 8 : 2)
      )
      const path = lineElsRef.current.get(edge.id)
      if (path) {
        path.setAttribute('x1', line.x1)
        path.setAttribute('y1', line.y1)
        path.setAttribute('x2', line.x2)
        path.setAttribute('y2', line.y2)
      }
      const label = labelElsRef.current.get(edge.id)
      if (label) {
        label.setAttribute('x', (line.x1 + line.x2) / 2)
        label.setAttribute('y', (line.y1 + line.y2) / 2)
      }
    }
  }

  useEffect(() => () => window.clearTimeout(clickTimerRef.current), [])

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
    allowFitRef.current = true
    const distance = clampLinkDistance(viewMode === 'topics' ? linkDistance : 72)
    const spawned = new Map(
      nodes.map((node, index) => {
        const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2
        return [node.id, { x: Math.cos(angle) * 48, y: Math.sin(angle) * 48 }]
      })
    )
    positionsRef.current = spawned
    settledRef.current = new Map([...spawned].map(([id, point]) => [id, { ...point }]))
    paintGeometry()

    if (nodes.length < 2) {
      animatingRef.current = false
      setLayoutEpoch((value) => value + 1)
      return undefined
    }

    const simNodes = nodes.map((node) => {
      const point = spawned.get(node.id)
      return { id: node.id, x: point.x, y: point.y, kind: node.data?.kind }
    })
    const simLinks = edges.map((edge) => ({ source: edge.source, target: edge.target }))
    const simulation = forceSimulation(simNodes)
      .force(
        'link',
        forceLink(simLinks)
          .id((node) => node.id)
          .distance(distance)
          .strength(0.55)
      )
      .force('charge', forceManyBody().strength(-180))
      .force('center', forceCenter(0, 0))
      .force(
        'collide',
        forceCollide()
          .radius((node) =>
            node.kind === 'topic' ? 26 : node.kind === 'file' || node.kind === 'course' ? 22 : 16
          )
          .iterations(2)
      )
      .alpha(1)
      .alphaDecay(0.028)
      .velocityDecay(0.35)
      .on('tick', () => {
        for (const node of simNodes) {
          const point = positionsRef.current.get(node.id)
          if (!point) continue
          point.x = node.x
          point.y = node.y
        }
        paintGeometry()
      })
      .on('end', () => {
        animatingRef.current = false
        settledRef.current = new Map(
          [...positionsRef.current].map(([id, point]) => [id, { ...point }])
        )
        if (allowFitRef.current) {
          const points = [...positionsRef.current.values()]
          const { width, height } = sizeRef.current
          cameraRef.current = fitTransform(points, width, height)
          applyCamera()
        }
        setLayoutEpoch((value) => value + 1)
      })
    const reach = Math.max(220, Math.sqrt(nodes.length) * distance * 1.2)
    reachRef.current = reach
    animatingRef.current = true
    cameraRef.current = fitTransform(
      [
        { x: -reach, y: -reach },
        { x: reach, y: reach }
      ],
      size.width,
      size.height
    )
    applyCamera()
    const stop = () => simulation.stop()
    simRef.current = { stop, nodes: simNodes, simulation }
    return () => {
      stop()
      animatingRef.current = false
      simRef.current = null
    }
  }, [layoutKey])

  useEffect(() => {
    if (!resetToken) return undefined
    allowFitRef.current = true
    animatingRef.current = false
    simRef.current?.stop()
    positionsRef.current = new Map(
      [...settledRef.current].map(([id, point]) => [id, { ...point }])
    )
    paintGeometry()
    setLayoutEpoch((value) => value + 1)
    return undefined
  }, [resetToken])

  useEffect(() => {
    if (animatingRef.current || !allowFitRef.current) return undefined
    const points = nodes.map((node) => pointOf(node.id, node))
    cameraRef.current = fitTransform(points, size.width, size.height)
    applyCamera()
    return undefined
  }, [layoutEpoch])

  useEffect(() => {
    if (animatingRef.current) {
      const reach = reachRef.current
      cameraRef.current = fitTransform(
        [
          { x: -reach, y: -reach },
          { x: reach, y: reach }
        ],
        size.width,
        size.height
      )
      applyCamera()
      return undefined
    }
    allowFitRef.current = true
    const points = nodes.map((node) => pointOf(node.id, node))
    cameraRef.current = fitTransform(points, size.width, size.height)
    applyCamera()
  }, [size.width, size.height, visibleKey])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return undefined
    const wheel = (event) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const prev = cameraRef.current
      allowFitRef.current = false
      const nextK = Math.min(2.4, Math.max(0.35, prev.k * (event.deltaY > 0 ? 0.92 : 1.08)))
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      cameraRef.current = {
        k: nextK,
        x: mx - ((mx - prev.x) * nextK) / prev.k,
        y: my - ((my - prev.y) * nextK) / prev.k
      }
      applyCamera()
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const toGraph = (event) => {
    const rect = hostRef.current.getBoundingClientRect()
    const { x, y, k } = cameraRef.current
    return {
      x: (event.clientX - rect.left - x) / k,
      y: (event.clientY - rect.top - y) / k
    }
  }

  const onBackgroundDown = (event) => {
    if (event.target !== event.currentTarget && event.target !== worldRef.current) return
    dragRef.current = {
      type: 'pan',
      origin: { x: event.clientX, y: event.clientY, cam: { ...cameraRef.current } },
      moved: false
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onNodeDown = (event, node) => {
    event.stopPropagation()
    const point = pointOf(node.id, node)
    dragRef.current = {
      type: 'node',
      id: node.id,
      moved: false,
      x: event.clientX,
      y: event.clientY,
      dx: point.x,
      dy: point.y
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.type === 'pan') {
      const dx = event.clientX - drag.origin.x
      const dy = event.clientY - drag.origin.y
      if (Math.hypot(dx, dy) > 3) {
        drag.moved = true
        allowFitRef.current = false
      }
      cameraRef.current = {
        ...drag.origin.cam,
        x: drag.origin.cam.x + dx,
        y: drag.origin.cam.y + dy
      }
      applyCamera()
      return
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 3) return
    if (!drag.moved) {
      drag.moved = true
      allowFitRef.current = false
      simRef.current?.simulation?.alphaTarget(0.35).restart()
    }
    const point = toGraph(event)
    const start = toGraph({ clientX: drag.x, clientY: drag.y })
    const next = { x: drag.dx + (point.x - start.x), y: drag.dy + (point.y - start.y) }
    positionsRef.current.set(drag.id, next)
    const simNode = simRef.current?.nodes?.find((item) => item.id === drag.id)
    if (simNode) {
      simNode.fx = next.x
      simNode.fy = next.y
      simNode.x = next.x
      simNode.y = next.y
    }
    paintGeometry()
  }

  const releaseDraggedNode = (drag, moved) => {
    if (!moved) return
    const simNode = simRef.current?.nodes?.find((item) => item.id === drag.id)
    if (simNode) {
      simNode.fx = null
      simNode.fy = null
    }
    simRef.current?.simulation?.alphaTarget(0).alpha(0.25).restart()
  }

  const onPointerUp = (event) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.type === 'node') releaseDraggedNode(drag, drag.moved)
    if (event.type === 'pointerleave') return
    if (drag.type === 'pan') {
      if (!drag.moved) onClear?.()
      return
    }
    if (drag.moved) return
    const node = nodes.find((item) => item.id === drag.id)
    if (!node) return
    if (event.shiftKey) {
      window.clearTimeout(clickTimerRef.current)
      onNodeShift?.(node)
      return
    }
    if (event.detail > 1) {
      window.clearTimeout(clickTimerRef.current)
      return
    }
    window.clearTimeout(clickTimerRef.current)
    clickTimerRef.current = window.setTimeout(() => onNodeClick?.(node), 220)
  }

  const onNodeDoubleClick = (event, node) => {
    event.stopPropagation()
    window.clearTimeout(clickTimerRef.current)
    onNodeActivate?.(node)
  }

  const highlightSet = highlightIds ? new Set(highlightIds) : null
  const hiddenKind = (node) => {
    if (viewMode !== 'topics') return false
    const kind = node.data?.kind
    if (kind === 'course' && !showCourses) return true
    if (kind === 'file' && !showFiles) return true
    if (node.data?.orphan && !showOrphans) return true
    return false
  }
  const kindShown = nodes.filter((node) => !hiddenKind(node))
  const kindShownIds = new Set(kindShown.map((node) => node.id))
  const linkedToShown = (node) =>
    edges.some((edge) => {
      const otherId = edge.source === node.id ? edge.target : edge.target === node.id ? edge.source : null
      return otherId && kindShownIds.has(otherId)
    })
  const shownNodes = kindShown.filter((node) => {
    if (viewMode !== 'topics' || node.data?.kind !== 'finding') return true
    if (linkedToShown(node)) return true
    return showOrphans && node.data?.orphan
  })
  const shownIds = new Set(shownNodes.map((node) => node.id))
  const shownEdges = edges.filter(
    (edge) => shownIds.has(edge.source) && shownIds.has(edge.target)
  )
  const hoverNeighbors = (() => {
    if (!hoverId || !shownNodes.some((node) => node.id === hoverId)) return null
    const set = new Set([hoverId])
    for (const edge of shownEdges) {
      if (edge.source === hoverId) set.add(edge.target)
      if (edge.target === hoverId) set.add(edge.source)
    }
    return set
  })()

  const dimmed = (id) => {
    if (hoverNeighbors) return !hoverNeighbors.has(id)
    if (highlightSet) return !highlightSet.has(id)
    return false
  }

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
          <p>Todavía no hay temas ni cursos para conectar.</p>
        </div>
      ) : (
        <svg
          ref={svgRef}
          className={`knowledge-graph__svg${showLabels ? ' is-labels' : ''}`}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="application"
          aria-label="Grafo de la biblioteca"
          onPointerDown={onBackgroundDown}
        >
          <defs>
            <marker
              id="knowledge-graph-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(42, 36, 56, 0.55)" />
            </marker>
          </defs>
          <g ref={worldRef}>
            {shownEdges.map((edge) => {
              const sourceNode = nodes.find((node) => node.id === edge.source)
              const targetNode = nodes.find((node) => node.id === edge.target)
              if (!sourceNode || !targetNode) return null
              const source = pointOf(edge.source, sourceNode)
              const target = pointOf(edge.target, targetNode)
              const arrow =
                showArrows &&
                (edge.edgeType === 'topic' ||
          edge.edgeType === 'file' ||
          edge.edgeType === 'course' ||
          edge.edgeType === 'link')
              const line = segment(
                source,
                target,
                radiusFor(sourceNode.data?.kind, edge.source === selectedId, nodeScale) + 2,
                radiusFor(targetNode.data?.kind, edge.target === selectedId, nodeScale) +
                  (arrow ? 8 : 2)
              )
              const hot = !dimmed(edge.source) && !dimmed(edge.target)
              return (
                <g key={edge.id}>
                  <line
                    ref={(el) => {
                      if (el) lineElsRef.current.set(edge.id, el)
                      else lineElsRef.current.delete(edge.id)
                    }}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    data-type={edge.edgeType}
                    markerEnd={arrow ? 'url(#knowledge-graph-arrow)' : undefined}
                    className={`knowledge-graph__link${hot ? ' is-hot' : ' is-dim'}`}
                  />
                  {edge.label ? (
                    <text
                      ref={(el) => {
                        if (el) labelElsRef.current.set(edge.id, el)
                        else labelElsRef.current.delete(edge.id)
                      }}
                      className="knowledge-graph__edge-label"
                      x={(line.x1 + line.x2) / 2}
                      y={(line.y1 + line.y2) / 2}
                    >
                      {edge.label}
                    </text>
                  ) : null}
                </g>
              )
            })}
            {shownNodes.map((node) => {
              const point = pointOf(node.id, node)
              const dim = dimmed(node.id)
              return (
                <g
                  key={node.id}
                  ref={(el) => {
                    if (el) nodeElsRef.current.set(node.id, el)
                    else nodeElsRef.current.delete(node.id)
                  }}
                  className={`knowledge-graph__node${node.id === selectedId ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`}
                  transform={`translate(${point.x} ${point.y})`}
                  onPointerDown={(event) => onNodeDown(event, node)}
                  onDoubleClick={(event) => onNodeDoubleClick(event, node)}
                  onPointerEnter={() => setHoverId(node.id)}
                  onPointerLeave={() => setHoverId((current) => (current === node.id ? null : current))}
                >
                  <circle
                    r={radiusFor(node.data?.kind, node.id === selectedId, nodeScale)}
                    fill={FILL[node.data?.kind] || FILL.finding}
                  />
                  <text
                    data-kind={node.data?.kind}
                    x={0}
                    y={radiusFor(node.data?.kind, node.id === selectedId, nodeScale) + 14}
                    textAnchor="middle"
                  >
                    {node.data?.label}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      )}
      {hoverId
        ? (() => {
            const node = shownNodes.find((item) => item.id === hoverId)
            const point = node ? pointOf(node.id, node) : null
            if (!node || !point) return null
            const { x, y, k } = cameraRef.current
            return (
              <div className="knowledge-graph__tip" style={{ left: x + point.x * k, top: y + point.y * k }}>
                {node.data?.kindLabel ? <span>{node.data.kindLabel}</span> : null}
                <strong>{node.data?.fullLabel}</strong>
              </div>
            )
          })()
        : null}
      {truncated ? <p className="knowledge-graph__note">Mostrando los vecinos más cercanos.</p> : null}
    </div>
  )
}

export default KnowledgeGraphView
