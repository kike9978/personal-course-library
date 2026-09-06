import { getInstitutionLogo, getCoverFallback, absoluteAssetUrl } from '../utils/images'
import { useEffect, useState } from 'react'

function CourseRow({ course, onError }) {
  const { path: coursePath, title: courseTitle, institution, programs = [], hasCover } = course
  const fallbackCover = absoluteAssetUrl(getCoverFallback())
  const [coverImg, setCoverImg] = useState(fallbackCover)
  const [institutionImg, setInstitutionImg] = useState(() =>
    absoluteAssetUrl(getInstitutionLogo(institution))
  )
  const [coverFailed, setCoverFailed] = useState(false)

  useEffect(() => {
    setInstitutionImg(absoluteAssetUrl(getInstitutionLogo(institution)))
  }, [institution])

  useEffect(() => {
    setCoverFailed(false)
    if (!hasCover) {
      setCoverImg(fallbackCover)
      return undefined
    }

    let cancelled = false
    window.api
      .getCoverImageUrl(coursePath)
      .then((url) => {
        if (!cancelled && url) setCoverImg(url)
      })
      .catch((error) => {
        console.error(error)
        if (!cancelled) setCoverImg(fallbackCover)
        if (onError) onError(error)
      })

    return () => {
      cancelled = true
    }
  }, [coursePath, hasCover, onError, fallbackCover])

  const handleClick = () => {
    window.api.openCourseFolder(coursePath).catch((error) => {
      console.error(error)
      if (onError) onError(error)
    })
  }

  return (
    <button type="button" onClick={handleClick} className="course-row">
      <img
        className="cover"
        src={coverFailed ? fallbackCover : coverImg}
        alt=""
        onError={() => {
          setCoverFailed(true)
          setCoverImg(fallbackCover)
        }}
      />
      <h3 title={courseTitle}>{courseTitle}</h3>
      {institutionImg ? (
        <img
          className="institution-logo"
          alt=""
          src={institutionImg}
          title={institution}
          onError={(e) => {
            const fallback = absoluteAssetUrl(getInstitutionLogo(null))
            if (fallback && e.currentTarget.src !== fallback) {
              e.currentTarget.src = fallback
            } else {
              e.currentTarget.style.display = 'none'
            }
          }}
        />
      ) : (
        <span className="institution-logo institution-logo--placeholder" title={institution} />
      )}
      {programs.map((program, index) => (
        <div key={`${program}-${index}`} className="badge badge--programs">
          <span>{program}</span>
        </div>
      ))}
    </button>
  )
}

export default CourseRow
