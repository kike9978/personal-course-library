import coverImage from "../assets/img/coverimage-test.svg"

function CourseCard({ courseTitle, institution, programs, isInProcess, onClick, coursePath }) {

  const programChips = programs.map((program) => {
    return (
      <div key={crypto.randomUUID} className="badge badge--programs">
        <span>{program}</span>
      </div>
    )
  })

  return (
    <div onClick={onClick} href="./" className="course-card">
      <img src={coverImage} alt="course thumbnail" className={`img-color--${Math.floor(Math.random() * 15) + 1}`} />
      <h3>{courseTitle && courseTitle}</h3>
      <img className="institution-logo" src={institution} alt="Institution logo" />
      <div>
        <span>Programas: </span>
        <div className="chips-container">{programChips}</div>
      </div>
      <div className="completion-rate">100%</div>
      <label>
        <input
          type="checkbox"
          checked={isInProcess}
          onChange={(e) => {
            e.stopPropagation()
            window.updateInProcessState(`${window.extensions.macos}${coursePath}/courseProps.json`)
          }}
        />{" "}
        En progreso
      </label>
    </div>
  )
}

export default CourseCard
