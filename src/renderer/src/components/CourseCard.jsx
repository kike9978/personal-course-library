import { useState } from 'react';
import coverImage from '../assets/img/coverimage-test.svg'
import CourseEditModal from './CourseEditModal';

function CourseCard({ courseTitle, institution, programs, coursePath, onOpenModalClick }) {
  const [isInProcess, setIsInProcess] = useState(window.readJSON(coursePath).isInProcess)

  const handleCheckboxClick = (e) => {
    e.preventDefault();
    window.updateInProcessState(`${window.extensions.macos}${coursePath}/courseProps.json`)
    console.log(window.readJSON(coursePath).isInProcess)
    setIsInProcess(window.readJSON(coursePath).isInProcess)
    console.log(window.readJSON(coursePath).isInProcess)
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
      <button onClick={handleCardClick} href="./" className="course-card">
        <img src={coverImage} alt="course thumbnail" className={`img-color--${Math.floor(Math.random() * 15) + 1}`} />
        <h3>{courseTitle && courseTitle}</h3>
        <img className="institution-logo" src={institution} alt="Institution logo" />
        <div>
          <span>Programas: </span>
          <div className="chips-container">{programChips}</div>
        </div>
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
      </button>


      {/* <CourseEditModal /> */}
    </>
  )
}

export default CourseCard
