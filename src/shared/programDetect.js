/**
 * Programs a course teaches, worked out without a model.
 * Three kinds of evidence, strongest first:
 *  1. Project files on disk (.blend, .aep, .psd…). The program that opens them is in use.
 *  2. The program named in the title, folder, description, sections or lessons.
 *  3. The person's own library: what other courses by the same instructor, school or theme use.
 * Returns the same item shape the chat reply parser returns, so one review screen serves both.
 */

import { programKey } from './coursePrograms.js'

/**
 * `exts`: project files only that program opens. `aliases`: names safe to match as words.
 * `loose`: names that are also ordinary words (illustrator, maya, sketch…). A loose hit is a guess.
 * `caseAliases`: short forms matched only in capitals (AE, C4D) so "ae" inside text does not count.
 */
export const PROGRAM_CATALOG = [
  {
    name: 'Photoshop',
    exts: ['.psd', '.psb', '.abr', '.atn', '.pat', '.grd'],
    aliases: ['photoshop', 'adobe photoshop']
  },
  {
    name: 'Illustrator',
    exts: ['.ai', '.ait'],
    aliases: ['adobe illustrator', 'illustrator cc'],
    loose: ['illustrator']
  },
  {
    name: 'After Effects',
    exts: ['.aep', '.aet', '.ffx'],
    aliases: ['after effects', 'aftereffects'],
    caseAliases: ['AE'],
    libraryNames: ['AE', 'Adobe After Effects']
  },
  {
    name: 'Premiere Pro',
    exts: ['.prproj'],
    aliases: ['premiere pro', 'adobe premiere'],
    loose: ['premiere']
  },
  { name: 'InDesign', exts: ['.indd', '.idml', '.indt'], aliases: ['indesign'] },
  { name: 'Lightroom', exts: ['.lrtemplate', '.lrcat'], aliases: ['lightroom'] },
  {
    name: 'Adobe Animate',
    exts: ['.fla'],
    aliases: ['adobe animate', 'animate cc', 'adobe flash'],
    libraryNames: ['Animate', 'Animate CC', 'Flash']
  },
  { name: 'DaVinci Resolve', exts: ['.drp', '.drt'], aliases: ['davinci resolve', 'davinci'] },
  {
    name: 'Cinema4D',
    exts: ['.c4d'],
    aliases: ['cinema 4d', 'cinema4d'],
    caseAliases: ['C4D'],
    libraryNames: ['Cinema 4D', 'C4D']
  },
  { name: 'Blender', exts: ['.blend'], aliases: ['blender'] },
  { name: 'Maya', exts: ['.ma', '.mb'], aliases: ['autodesk maya'], loose: ['maya'] },
  { name: '3ds Max', exts: ['.max'], aliases: ['3ds max', '3dsmax', '3d studio max'] },
  { name: 'ZBrush', exts: ['.ztl', '.zpr', '.zbr', '.zpp'], aliases: ['zbrush'] },
  { name: 'Houdini', exts: ['.hip', '.hipnc', '.hiplc'], aliases: ['houdini'] },
  {
    name: 'Substance Painter',
    exts: ['.spp', '.sppr'],
    aliases: ['substance painter', 'substance 3d painter']
  },
  {
    name: 'Substance Designer',
    exts: ['.sbs', '.sbsar'],
    aliases: ['substance designer', 'substance 3d designer']
  },
  { name: 'Marvelous Designer', exts: ['.zprj', '.zpac'], aliases: ['marvelous designer'] },
  { name: 'Marmoset Toolbag', exts: ['.tbscene'], aliases: ['marmoset', 'toolbag'] },
  { name: 'KeyShot', exts: ['.ksp'], aliases: ['keyshot'] },
  {
    name: 'Unreal Engine',
    exts: ['.uasset', '.umap', '.uproject'],
    aliases: ['unreal engine', 'ue4', 'ue5'],
    loose: ['unreal']
  },
  {
    name: 'Unity',
    exts: ['.unity', '.unitypackage'],
    aliases: ['unity3d', 'unity 3d', 'unity engine'],
    loose: ['unity']
  },
  { name: 'Godot', exts: ['.tscn', '.godot'], aliases: ['godot'] },
  { name: 'Nuke', exts: ['.nk'], aliases: ['nuke'] },
  {
    name: 'Rhino',
    exts: ['.3dm'],
    aliases: ['rhino 3d', 'rhinoceros'],
    loose: ['rhino', 'grasshopper']
  },
  { name: 'SketchUp', exts: ['.skp'], aliases: ['sketchup'] },
  { name: 'Fusion 360', exts: ['.f3d'], aliases: ['fusion 360'] },
  {
    name: 'Clip Studio Paint',
    exts: ['.clip', '.lip'],
    aliases: ['clip studio', 'clip studio paint']
  },
  { name: 'Procreate', exts: ['.procreate', '.brushset', '.brush'], aliases: ['procreate'] },
  { name: 'Krita', exts: ['.kra'], aliases: ['krita'] },
  { name: 'TVPaint', exts: ['.tvpp', '.tvpx'], aliases: ['tvpaint', 'tv paint'] },
  {
    name: 'Toon Boom Harmony',
    exts: ['.xstage'],
    aliases: ['toon boom', 'toonboom'],
    loose: ['harmony']
  },
  { name: 'Moho', exts: ['.moho', '.mohoproj', '.anime'], aliases: ['moho', 'anime studio'] },
  { name: 'Spine', exts: ['.spine'], aliases: ['spine 2d', 'esoteric spine'] },
  { name: 'Rive', exts: ['.riv'], aliases: ['rive app'] },
  { name: 'Cascadeur', exts: ['.casc'], aliases: ['cascadeur'] },
  { name: 'Figma', exts: ['.fig'], aliases: ['figma'] },
  { name: 'Sketch', exts: ['.sketch'], aliases: ['sketch app', 'sketchapp'], loose: ['sketch'] },
  { name: 'Affinity Designer', exts: ['.afdesign'], aliases: ['affinity designer'] },
  { name: 'Affinity Photo', exts: ['.afphoto'], aliases: ['affinity photo'] },
  { name: 'Octane', exts: [], aliases: ['octane render', 'octane'] },
  { name: 'Redshift', exts: [], aliases: ['redshift'] },
  { name: 'V-Ray', exts: ['.vrscene'], aliases: ['v-ray', 'vray'] },
  { name: 'Arnold', exts: [], aliases: ['arnold render', 'arnold renderer'] },
  { name: 'Ableton Live', exts: ['.als'], aliases: ['ableton'] },
  { name: 'FL Studio', exts: ['.flp'], aliases: ['fl studio'] },
  { name: 'Logic Pro', exts: ['.logicx'], aliases: ['logic pro'] },
  { name: 'Excel', exts: [], aliases: ['microsoft excel'], loose: ['excel'] },
  {
    name: 'VS Code',
    exts: ['.code-workspace'],
    aliases: ['vs code', 'vscode', 'visual studio code']
  },
  { name: 'Notion', exts: [], aliases: [], loose: ['notion'] },
  { name: 'Obsidian', exts: [], aliases: [], loose: ['obsidian'] },
  { name: 'Evernote', exts: ['.enex'], aliases: ['evernote'] },
  { name: 'Todoist', exts: [], aliases: ['todoist'] }
]

/**
 * Traditional media and materials. No project files: only names in the text and the library.
 * English and Spanish names, since course titles in the library come in both.
 * `loose` words also have a digital meaning ("ink" a drawing, "clay" render, "pastel" colors).
 */
export const MEDIA_CATALOG = [
  {
    name: 'Graphite',
    aliases: [
      'graphite',
      'grafito',
      'pencil drawing',
      'dibujo a lápiz',
      'dibujo a lapiz',
      'lápiz de grafito',
      'lapiz de grafito'
    ],
    loose: ['pencil', 'pencils', 'lápiz', 'lapiz']
  },
  {
    name: 'Charcoal',
    aliases: [
      'charcoal',
      'carboncillo',
      'carbón vegetal',
      'carbon vegetal',
      'conté',
      'conte crayon'
    ]
  },
  {
    name: 'Ink',
    aliases: [
      'india ink',
      'pen and ink',
      'pen & ink',
      'tinta china',
      'brush pen',
      'dip pen',
      'plumilla',
      'ink wash',
      'aguada de tinta',
      'sumi-e',
      'sumi'
    ],
    loose: ['ink', 'inks', 'inking', 'tinta', 'entintado']
  },
  {
    name: 'Watercolor',
    aliases: ['watercolor', 'watercolors', 'watercolour', 'watercolours', 'acuarela', 'acuarelas']
  },
  { name: 'Gouache', aliases: ['gouache', 'guache', 'gouaches'] },
  {
    name: 'Acrylic',
    aliases: [
      'acrylic',
      'acrylics',
      'acrylic paint',
      'acrílico',
      'acrilico',
      'acrílicos',
      'acrilicos'
    ]
  },
  {
    name: 'Oil',
    aliases: [
      'oil painting',
      'oil paint',
      'oil paints',
      'oils',
      'óleo',
      'oleo',
      'pintura al óleo',
      'pintura al oleo'
    ],
    loose: ['oil']
  },
  {
    name: 'Pastel',
    aliases: [
      'soft pastel',
      'soft pastels',
      'oil pastel',
      'oil pastels',
      'pastel pencils',
      'pastel seco',
      'pasteles'
    ],
    loose: ['pastel', 'pastels']
  },
  {
    name: 'Colored Pencils',
    aliases: [
      'colored pencils',
      'colored pencil',
      'coloured pencils',
      'lápices de colores',
      'lapices de colores',
      'prismacolor',
      'polychromos'
    ]
  },
  {
    name: 'Markers',
    aliases: [
      'alcohol markers',
      'copic',
      'copic markers',
      'rotuladores',
      'rotuladores de alcohol',
      'promarker'
    ],
    loose: ['markers', 'marker']
  },
  {
    name: 'Ballpoint',
    aliases: ['ballpoint', 'ballpoint pen', 'bolígrafo', 'boligrafo', 'birome']
  },
  {
    name: 'Clay',
    aliases: [
      'polymer clay',
      'arcilla',
      'plastilina',
      'modeling clay',
      'modelling clay',
      'sculpey',
      'cerámica',
      'ceramica',
      'ceramics'
    ],
    loose: ['clay']
  },
  {
    name: 'Printmaking',
    aliases: [
      'printmaking',
      'linocut',
      'linograbado',
      'woodcut',
      'xilografía',
      'xilografia',
      'screen printing',
      'serigrafía',
      'serigrafia',
      'etching'
    ],
    loose: ['grabado']
  },
  { name: 'Tempera', aliases: ['tempera', 'témpera', 'egg tempera'] },
  { name: 'Sketchbook', aliases: [], loose: ['sketchbook', 'cuaderno de bocetos'] },
  // Photography is shot with a camera even when the course also uses Lightroom or Photoshop,
  // so it skips the digital-course downgrade. Bare "photo" is left out on purpose: drawing
  // courses say "photo references", "photobashing" and "photorealistic".
  {
    name: 'Photography',
    digitalOk: true,
    aliases: [
      'photography',
      'photographer',
      'photographers',
      'fotografía',
      'fotografia',
      'fotográfico',
      'fotografico',
      'fotográfica',
      'fotografica',
      'fotógrafo',
      'fotografo',
      'fotógrafa',
      'dslr',
      'mirrorless',
      'réflex',
      'reflex camera',
      'cámara réflex',
      'digital camera',
      'cámara digital'
    ],
    loose: ['camera', 'cameras', 'cámara', 'camara']
  },
  {
    name: 'Film Photography',
    digitalOk: true,
    covers: ['Photography'],
    aliases: [
      'film photography',
      'analog photography',
      'analogue photography',
      'film camera',
      'analog camera',
      'fotografía analógica',
      'fotografia analogica',
      'cámara analógica',
      'camara analogica',
      '35mm film',
      'medium format film',
      'darkroom',
      'cuarto oscuro',
      'film developing',
      'revelado de película',
      'carrete'
    ]
  }
].map((entry) => ({ exts: [], ...entry }))

/** Each field the detector can fill, with its catalog and the word used in evidence notes. */
export const DETECT_FIELDS = {
  programs: { catalog: () => PROGRAM_CATALOG, noun: 'el programa' },
  media: { catalog: () => MEDIA_CATALOG, noun: 'el medio' }
}

function fieldSpec(field) {
  return DETECT_FIELDS[field] || DETECT_FIELDS.programs
}

/** Software features named after a traditional medium. Removed before looking for media. */
const TOOL_PHRASES =
  /grease[\s_-]*pencil|pencil tool|ink brush|watercolou?r brush(es)?|oil brush(es)?/giu
const DIGITAL_WORDS =
  /(?<![\p{L}\p{N}])(ipad|procreate|tablet|wacom|digital|digitales?)(?![\p{L}\p{N}])/iu

function stripToolPhrases(text) {
  return String(text || '').replace(TOOL_PHRASES, ' ')
}

/** Tagged with programs, project files or program names in it, or says iPad/tablet/digital. */
function isDigitalCourse(course, digest) {
  if (listFacts(course?.programs).length) return true
  const text = `${fact(course?.title)} ${fact(course?.path)} ${fact(course?.description?.summary)}`
  if (DIGITAL_WORDS.test(text)) return true
  return detectCoursePrograms({ ...course, programs: [] }, digest, { field: 'programs' }).some(
    (s) => s.confidence !== 'low'
  )
}

const MAX_SUGGESTIONS = 6
/** Fewer project files than this is "probable": one stray .psd in a Blender course is a texture. */
const FILES_FOR_SURE = 3
const RANK = { high: 0, medium: 1, low: 2 }

/** Instructor/school priors: share of their tagged courses that use a program. */
const INSTRUCTOR_SHARE = 0.5
const GROUP_SHARE = 0.6
const GROUP_MIN = 3

function fact(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function listFacts(value) {
  return Array.isArray(value) ? value.map(fact).filter(Boolean) : []
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-word, accent-tolerant matcher. "Blender" matches "blender's" but not "blenders". */
function wordRe(alias, flags = 'iu') {
  const body = escapeRe(alias).replace(/\\?\s+/g, '[\\s_.-]*')
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, flags)
}

/**
 * Matchers for the catalog plus any program the library uses that the catalog does not know.
 * `label` is the spelling to show: the library's own when it has one.
 */
function compile(catalog, vocabulary) {
  const vocab = listFacts(vocabulary)
  const entries = catalog.map((entry) => {
    const looseKeys = new Set((entry.loose || []).map(programKey))
    const names = [entry.name, ...(entry.libraryNames || [])]
    const keys = new Set(names.map(programKey))
    const libraryLabel = vocab.find((name) => keys.has(programKey(name)))
    return {
      name: entry.name,
      key: programKey(entry.name),
      keys,
      label: libraryLabel || entry.name,
      known: Boolean(libraryLabel),
      exts: new Set((entry.exts || []).map((ext) => ext.toLowerCase())),
      // The name itself is a safe match unless it is also an ordinary word (listed in `loose`).
      strict: [
        ...(entry.aliases || []),
        ...(looseKeys.has(programKey(entry.name)) ? [] : [entry.name])
      ].map((alias) => wordRe(alias)),
      caps: (entry.caseAliases || []).map((alias) => wordRe(alias, 'u')),
      loose: (entry.loose || []).map((alias) => wordRe(alias)),
      digitalOk: entry.digitalOk === true,
      covers: new Set((entry.covers || []).map(programKey))
    }
  })
  // Programs the library uses that the catalog does not know are matched by their exact
  // spelling, case included, so a tag like "Animate" does not fire on the verb "animate".
  const taken = new Set(entries.flatMap((entry) => [...entry.keys]))
  for (const name of vocab) {
    const key = programKey(name)
    if (!key || taken.has(key) || name.length < 3) continue
    taken.add(key)
    entries.push({
      name,
      key,
      keys: new Set([key]),
      label: name,
      known: true,
      exts: new Set(),
      strict: [],
      caps: [wordRe(name, 'u')],
      loose: []
    })
  }
  return entries
}

/** How the text names the program: 'strict', 'loose', or ''. */
function nameHit(entry, text) {
  if (!text) return ''
  if (entry.strict.some((re) => re.test(text)) || entry.caps.some((re) => re.test(text)))
    return 'strict'
  if (entry.loose.some((re) => re.test(text))) return 'loose'
  return ''
}

function extCounts(files) {
  const counts = new Map()
  for (const name of files || []) {
    const match = /(\.[a-z0-9-]{1,16})$/i.exec(String(name || ''))
    if (!match) continue
    const ext = match[1].toLowerCase()
    counts.set(ext, (counts.get(ext) || 0) + 1)
  }
  return counts
}

/**
 * Library priors from courses that already carry programs.
 * Built once per run; the course being scored is left out of its own prior.
 */
export function buildLibraryPriors(courses, field = 'programs') {
  const groups = { instructor: new Map(), institution: new Map(), theme: new Map() }
  const add = (map, label, course) => {
    const key = fact(label).toLowerCase()
    if (!key) return
    const row = map.get(key) || { label: fact(label), courses: [] }
    row.courses.push(course)
    map.set(key, row)
  }
  for (const course of Array.isArray(courses) ? courses : []) {
    const programs = listFacts(course?.[field])
    if (!programs.length || !fact(course?.path)) continue
    const slim = { path: course.path, programs }
    add(groups.instructor, course.instructor, slim)
    add(groups.institution, course.institution, slim)
    for (const theme of listFacts(course.theme)) add(groups.theme, theme, slim)
  }
  return groups
}

function priorShares(row, selfPath) {
  if (!row) return { total: 0, shares: [] }
  const others = row.courses.filter((course) => course.path !== selfPath)
  const counts = new Map()
  const names = new Map()
  for (const course of others) {
    for (const name of course.programs) {
      const key = programKey(name)
      if (!names.has(key)) names.set(key, name)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  return {
    total: others.length,
    shares: [...counts.entries()].map(([key, count]) => ({
      key,
      name: names.get(key),
      count,
      share: count / others.length
    }))
  }
}

/**
 * Suggestions for one course.
 * `digest`: { sections: string[], lessons: string[], files: string[] } from the folder scan.
 * `priors`: buildLibraryPriors(library). `vocabulary`: program names the library already uses.
 */
export function detectCoursePrograms(
  course,
  digest,
  { priors, vocabulary = [], catalog, field = 'programs' } = {}
) {
  const spec = fieldSpec(field)
  const entries = compile(catalog || spec.catalog(), vocabulary)
  const current = new Set(listFacts(course?.[field]).map(programKey))
  // In a digital course "watercolor" is more likely a brush that imitates it: one step down.
  const digital = field === 'media' && isDigitalCourse(course, digest)
  const textConfidence = (level) => (digital ? (level === 'high' ? 'medium' : 'low') : level)
  const digitalNote = digital ? ' (curso digital: puede ser un pincel que lo imita)' : ''
  const isCurrent = (entry) => [...entry.keys].some((key) => current.has(key))
  const found = new Map()
  const offer = (entry, confidence, evidence) => {
    if (isCurrent(entry)) return
    const prev = found.get(entry.key)
    if (prev && RANK[prev.confidence] <= RANK[confidence]) {
      if (prev.confidence === confidence && !prev.evidence.includes(evidence))
        prev.evidence.push(evidence)
      return
    }
    found.set(entry.key, {
      key: entry.key,
      name: entry.label,
      known: entry.known,
      confidence,
      evidence: [evidence]
    })
  }

  // 1. Project files.
  const exts = extCounts(digest?.files)
  for (const entry of entries) {
    for (const [ext, count] of exts) {
      if (entry.exts.has(ext)) {
        offer(
          entry,
          count >= FILES_FOR_SURE ? 'high' : 'medium',
          count === 1 ? `1 archivo ${ext}` : `${count} archivos ${ext}`
        )
      }
    }
  }

  // 2. Names in the text. Title and folder say what the course is about; one lesson may be a detour.
  const clean = field === 'media' ? stripToolPhrases : (text) => text
  const headline = clean(`${fact(course?.title)} ${fact(course?.path)}`)
  const description = clean(
    [fact(course?.description?.summary), ...listFacts(course?.description?.outcomes)].join(' ')
  )
  const sections = listFacts(digest?.sections).map(clean)
  const lessons = listFacts(digest?.lessons).map(clean)
  for (const entry of entries) {
    // Photography stays photography in a course that also uses Lightroom.
    const tc = entry.digitalOk ? (level) => level : textConfidence
    const note = entry.digitalOk ? '' : digitalNote
    const inTitle = nameHit(entry, headline)
    if (inTitle === 'strict') offer(entry, tc('high'), `el título lo nombra${note}`)
    else if (inTitle === 'loose')
      offer(
        entry,
        'low',
        `el título dice «${entry.name.toLowerCase()}» (puede no ser ${spec.noun})`
      )

    const inDescription = nameHit(entry, description)
    if (inDescription === 'strict') {
      // A description may mention photography in a 3D or retouching course without teaching it.
      if (entry.digitalOk && digital)
        offer(
          entry,
          'medium',
          'la descripción lo nombra (curso digital: puede hablar de fotografía sin enseñarla)'
        )
      else offer(entry, tc('high'), `la descripción lo nombra${note}`)
    } else if (inDescription === 'loose') offer(entry, 'low', 'la descripción usa la palabra')

    const lessonHits = [...sections, ...lessons].filter((text) => nameHit(entry, text) === 'strict')
    if (lessonHits.length >= 2)
      offer(entry, tc('high'), `${lessonHits.length} lecciones lo nombran${note}`)
    else if (lessonHits.length === 1)
      offer(entry, tc('medium'), `la lección «${lessonHits[0].slice(0, 60)}»${note}`)
  }

  // 3. The library: what this instructor, school or theme already uses.
  if (priors) {
    const entryFor = (row) =>
      entries.find((entry) => entry.keys.has(row.key)) || {
        key: row.key,
        keys: new Set([row.key]),
        label: row.name,
        known: true
      }
    const instructor = fact(course?.instructor)
    if (instructor) {
      const { total, shares } = priorShares(
        priors.instructor.get(instructor.toLowerCase()),
        course?.path
      )
      for (const row of shares) {
        if (total && row.share >= INSTRUCTOR_SHARE) {
          offer(entryFor(row), 'medium', `${row.count} de ${total} cursos de ${instructor} lo usan`)
        }
      }
    }
    const groupPrior = (map, label, describe) => {
      const { total, shares } = priorShares(map.get(label.toLowerCase()), course?.path)
      if (total < GROUP_MIN) return
      for (const row of shares) {
        if (row.share >= GROUP_SHARE) {
          offer(entryFor(row), 'low', `${row.count} de ${total} ${describe(label)}`)
        }
      }
    }
    const institution = fact(course?.institution)
    if (institution) groupPrior(priors.institution, institution, (l) => `cursos de ${l} lo usan`)
    for (const theme of listFacts(course?.theme)) {
      groupPrior(priors.theme, theme, (l) => `cursos de «${l}» lo usan`)
    }
  }

  // A more specific entry replaces the general one it covers (film photography → photography).
  for (const entry of entries) {
    if (!found.has(entry.key)) continue
    for (const key of entry.covers || []) found.delete(key)
  }

  return [...found.values()]
    .sort((a, b) => RANK[a.confidence] - RANK[b.confidence] || a.name.localeCompare(b.name))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ name, known, confidence, evidence }) => ({
      name,
      known,
      confidence,
      evidence: evidence.slice(0, 3).join('; ')
    }))
}

/** Section titles, lesson titles and every file name in a scanned outline. */
export function outlineDigest(outline) {
  const sections = []
  const lessons = []
  const files = []
  const fileOf = (item) => {
    const name =
      item?.name ||
      String(item?.relativePath || '')
        .split('/')
        .pop()
    if (name) files.push(name)
  }
  const walkResources = (list) => {
    for (const res of Array.isArray(list) ? list : []) {
      fileOf(res)
      walkResources(res?.resources)
    }
  }
  const walkSections = (list) => {
    for (const section of Array.isArray(list) ? list : []) {
      if (section?.title) sections.push(fact(section.title))
      for (const lesson of Array.isArray(section?.lessons) ? section.lessons : []) {
        if (lesson?.title) lessons.push(fact(lesson.title))
        fileOf(lesson)
        walkResources(lesson?.resources)
      }
      walkResources(section?.resources)
      walkSections(section?.sections)
    }
  }
  walkSections(outline?.sections)
  walkResources(outline?.courseResources)
  walkSections(outline?.courseResourceSections)
  return { sections, lessons, files }
}

export const NO_CLUES = 'Sin pistas en el título, las lecciones, los archivos ni la biblioteca.'

/** Run detection over many courses. Courses with nothing found come back in `skips`. */
export function detectProgramsBatch(
  entries,
  { library = [], vocabulary = [], field = 'programs' } = {}
) {
  const priors = buildLibraryPriors(library, field)
  const items = []
  const skips = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    const course = entry?.course
    if (!fact(course?.path)) continue
    const title = fact(course.title) || course.path
    if (entry.error) {
      skips.push({ path: course.path, title, reason: entry.error })
      continue
    }
    const suggestions = detectCoursePrograms(course, entry.digest, { priors, vocabulary, field })
    if (!suggestions.length) {
      skips.push({ path: course.path, title, reason: NO_CLUES })
      continue
    }
    items.push({ path: course.path, title, current: listFacts(course[field]), suggestions })
  }
  return { items, skips }
}
