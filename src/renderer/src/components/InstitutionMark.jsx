import { useEffect, useState } from 'react'
import { absoluteAssetUrl, getInstitutionLogo, hasInstitutionLogo } from '../utils/images'

export function InstitutionMark({ institution, nameClassName, emptyLabel = null }) {
  const specific = hasInstitutionLogo(institution)
  const src = specific ? absoluteAssetUrl(getInstitutionLogo(institution)) : ''
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [institution, src])

  if (specific && src && !failed) {
    return (
      <img
        className="institution-logo"
        src={src}
        alt={institution || ''}
        title={institution || undefined}
        onError={() => setFailed(true)}
      />
    )
  }

  if (institution) {
    return <span className={nameClassName}>{institution}</span>
  }

  if (emptyLabel != null) {
    return <span>{emptyLabel}</span>
  }

  return null
}
