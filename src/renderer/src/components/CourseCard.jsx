import coverImage from "../assets/img/coverimage-test.svg"

function CourseCard({courseTitle, institution, programs, onClick}) {
  return (
    <button onClick={onClick} href="./" className="course-card">
      <img src={coverImage} alt="course thumbnail" />
      <h3>{courseTitle && courseTitle}</h3>
      <div className="badge badge--institution">
        <span>{institution}</span>
      </div>
      <div>
        <span>Programas: </span>
        <div className="badge badge--programs">
          <span>{programs}</span>
        </div>
      </div>
      <div className="completion-rate">100%</div>
    </button>
  )
}

export default CourseCard
