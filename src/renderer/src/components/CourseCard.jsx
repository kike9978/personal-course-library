import { useState } from 'react';
import coverImage from '../assets/img/coverimage-test.svg'

function CourseCard({ courseTitle, institution, institutionImgUrl, programs, coursePath, onOpenModalClick }) {
  const [isInProcess, setIsInProcess] = useState(window.readJSON(coursePath).isInProcess)

  const handleCheckboxClick = (e) => {
    e.preventDefault();
    window.updateInProcessState(`${window.extensions.macos}${coursePath}/courseProps.json`)
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
    <div onClick={handleCardClick} href="./" className="course-card">
      <img src={coverImage} alt="course thumbnail" className={`img-color--${Math.floor(Math.random() * 15) + 1}`} />
      <button className="edit-course-button" onClick={(e) => handleOpenModalClick(e)}>
      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/></svg>
      </button>
      <div className="course-info">
        <h3>{courseTitle && courseTitle}</h3>
        <img className="institution-logo" src={institutionImgUrl} alt={`${institution} logo`} title={institution} />
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
          En curso
        </label>
      </div>
      
    </div>
  )
}

export default CourseCard
