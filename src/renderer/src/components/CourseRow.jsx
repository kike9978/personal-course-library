import coverImage from "../assets/img/coverimage-test.svg"

function CourseRow({ courseTitle, institution, programs, onClick}) {
  return (
    <button onClick={onClick} href="./" className="course-row">
      <img src={coverImage} alt="course thumbnail" className={`img-color--${Math.floor(Math.random() * 15) + 1}`} />
      <h3 title={courseTitle}>{courseTitle && courseTitle}</h3>
      <div className="badge badge--institution">
        <span>{institution}</span>
      </div>

      <div className="badge badge--programs">
        <span>{programs}</span>
      </div>
      <div className="completion-rate">100%</div>
    </button>
  )
}

export default CourseRow
