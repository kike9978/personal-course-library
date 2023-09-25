import coverImage from "../assets/img/coverimage-test.png"

function CourseCard({courseTitle, institution, programs}) {
  return (
    <a href="./" className="course-card">
      <h3>{courseTitle && courseTitle}</h3>
      <img src={coverImage} alt="course thumbnail" />
      <p>Institución: {institution}</p>
      <p>Programas:{programs}</p>
      <div className="completion-rate">100%</div>
    </a>
  )
}

export default CourseCard
