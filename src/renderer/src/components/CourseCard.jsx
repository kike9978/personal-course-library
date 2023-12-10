import { useState } from 'react';
import coverImage from '../assets/img/coverimage-test.svg'

function CourseCard({ courseTitle,institution, institutionImgUrl, programs, coursePath, onOpenModalClick }) {
  const [isInProcess, setIsInProcess] = useState(window.readJSON(coursePath).isInProcess)

  const handleCheckboxClick = (e) => {
    e.preventDefault();
    window.updateInProcessState(`${window.extensions.windows}${coursePath}/courseProps.json`)
    setIsInProcess(window.readJSON(coursePath).isInProcess)
  }

  const handleCardClick = (e) => {
    if (!e.target.closest(".in-progress")) {
      window.openFolder(coursePath)
    }
  }

  const handleOpenModalClick = (e) => {
    e.stopPropagation()
    onOpenModalClick()
    document.querySelector(".dialog").showModal()

  }

  const programChips = programs.map((program) => {
    return (
      <div key={crypto.randomUUID} className="badge badge--programs">
        <span>{program}</span>
      </div>
    )
  })

  return (
    <>
      <div onClick={handleCardClick} href="./" className="course-card">
        <img src={coverImage} alt="course thumbnail" className={`img-color--${Math.floor(Math.random() * 15) + 1}`} />
        <h3>{courseTitle && courseTitle}</h3>
        <img className="institution-logo" src={institutionImgUrl} alt="institution logo" title={institution}/>
          <div className="chips-container">{programChips}</div>
        <div className="completion-rate">100%</div>
        <label className="in-progress">
          <input
            type="checkbox"
            checked={isInProcess}
            onChange={(e) => {
              handleCheckboxClick(e)
            }}
          />{" "}
          En progreso
        </label>
        <button onClick={(e) => handleOpenModalClick(e)}>
          Editar Curso
        </button>
      </div>


      {/* <CourseEditModal /> */}
    </>
  )
}

export default CourseCard
