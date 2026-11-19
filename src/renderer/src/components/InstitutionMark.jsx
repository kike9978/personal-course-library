import { useEffect, useState } from 'react'
import { absoluteAssetUrl, getInstitutionLogo, hasInstitutionLogo } from '../utils/images'

const institutionName = 'text-xs font-bold text-coral-deep'

export function InstitutionMark({ institution, nameClassName, emptyLabel = null }) {
  const specific = hasInstitutionLogo(institution)
  const src = specific ? absoluteAssetUrl(getInstitutionLogo(institution)) : ''
  const [failed, setFailed] = useState(false)
  const nameClass =
    !nameClassName || nameClassName === 'institution-name' ? institutionName : nameClassName

  useEffect(() => {
    setFailed(false)
  }, [institution, src])

  if (specific && src && !failed) {
    return (
      <img
        className="institution-logo max-h-[1.1rem] max-w-[4.5rem] object-contain object-left"
        src={src}
        alt={institution || ''}
        title={institution || undefined}
        onError={() => setFailed(true)}
      />
    )
  }

  if (institution) {
    return <span className={nameClass}>{institution}</span>
  }

  if (emptyLabel != null) {
    return <span>{emptyLabel}</span>
  }

  return null
}
