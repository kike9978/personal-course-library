import coverImage from "../assets/img/coverimage-test.svg"

function CourseCard({ courseTitle, institution, programs, isInProcess, coursePath }) {

  const handleCheckboxClick = (e) => {
    e.preventDefault();
    console.log("picaste el checkbox")
    // window.updateInProcessState(`${window.extensions.macos}${coursePath}/courseProps.json`)
  }

  const handelCardClick = (e) =>{
    if (!e.target.closest(".in-progress")){
      window.openFolder(coursePath)
      console.log("picaste la card")
    }
  }

  const programChips = programs.map((program) => {
    return (
      <div key={crypto.randomUUID} className="badge badge--programs">
        <span>{program}</span>
      </div>
    )
  })

  return (
    <button onClick={handelCardClick} href="./" className="course-card">
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
            console.log(e)
          }}
          onClick={(e)=> e.preventDefault()}
        />{" "}
        En progreso
      </label>
    </button>
  )
}

export default CourseCard
