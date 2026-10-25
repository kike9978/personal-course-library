import coverFallback from '../assets/img/coverimage-test.svg'

const institutionModules = import.meta.glob(
  '../assets/img/institutions/*.{png,jpg,jpeg,svg,webp,gif}',
  {
    eager: true,
    query: '?url',
    import: 'default'
  }
)

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** Map normalized institution names to logo filename stems (without -logo). */
const INSTITUTION_ALIASES = {
  buildingasecondbrain: 'basb',
  secondbrain: 'basb',
  thegnomonworkshop: 'gnomonws',
  gnomonworkshop: 'gnomonws',
  gnomon: 'gnomonws',
  mographmentor: 'momentor',
  motiondesignschool: 'mds',
  newmasteracademy: 'nma',
  schoolofmotion: 'som',
  holdframeschoolofmotion: 'holdframe',
  holdframe: 'holdframe',
  thefutur: 'thefutur',
  medsmap: 'medsmap',
  rossdrawsbootcamp: 'default',
  foundationpatreon: 'default',
  greyscalegorillaplus: 'default',
  charactercreationinblender: 'default',
  stylizedstation: 'default',
  artchallenge: 'default',
  artofsteveahn: 'default',
  ajsmartandjakeknapp: 'default',
  juice: 'default',
  alive: 'default',
  projectcity: 'projectcity',
  radhowtoclass: 'projectcity',
  fireshipio: 'fireship',
  polygonrunway: 'polygonrunway',
  jamesdouglasmoderndayjames: 'default',
  coloso: 'coloso',
  artstation: 'artstation',
  skillshare: 'skillshare'
}

const institutionByKey = new Map()

function toAssetUrl(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && typeof value.default === 'string') return value.default
  return null
}

for (const [modulePath, url] of Object.entries(institutionModules)) {
  const resolved = toAssetUrl(url)
  if (!resolved) continue

  const filename = modulePath.split('/').pop() || ''
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '')
  const stem = nameWithoutExt.replace(/-?logo$/i, '')
  const fullKey = normalizeKey(nameWithoutExt)
  const stemKey = normalizeKey(stem)

  institutionByKey.set(fullKey, resolved)
  institutionByKey.set(stemKey, resolved)
  institutionByKey.set(normalizeKey(stem.replace(/-/g, '')), resolved)
}

export function getInstitutionLogo(institution) {
  const fallback = institutionByKey.get('default') || null
  if (!institution) return fallback

  const key = normalizeKey(institution)

  if (institutionByKey.has(key)) {
    return institutionByKey.get(key)
  }

  const alias = INSTITUTION_ALIASES[key]
  if (alias) {
    const aliasKey = normalizeKey(alias)
    if (institutionByKey.has(aliasKey)) {
      return institutionByKey.get(aliasKey)
    }
  }

  if (key.length >= 4) {
    for (const [logoKey, url] of institutionByKey.entries()) {
      if (logoKey.length < 4 || logoKey === 'default') continue
      if (logoKey.includes(key) || key.includes(logoKey)) {
        return url
      }
    }
  }

  return fallback
}

/** True when a real institution logo exists (not the generic placeholder). */
export function hasInstitutionLogo(institution) {
  if (!institution) return false
  const fallback = institutionByKey.get('default') || null
  const logo = getInstitutionLogo(institution)
  if (!logo) return false
  return logo !== fallback
}

export function getCoverFallback() {
  return toAssetUrl(coverFallback) || coverFallback
}

/** Resolve an asset URL against the page origin (avoids course-media relative breakage). */
export function absoluteAssetUrl(assetUrl) {
  const url = toAssetUrl(assetUrl) || assetUrl
  if (!url) return ''
  if (/^(https?:|data:|blob:|course-media:|file:)/i.test(url)) return url
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}
