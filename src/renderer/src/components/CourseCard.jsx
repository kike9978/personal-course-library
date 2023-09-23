function CourseCard({courseTitle}) {
  return (
    <a href="./" className="course-card">
      <h3>{courseTitle && courseTitle}</h3>
      <img src="./coverimage-test.jpg" alt="course thumbnail" />
    </a>
  )
}

export default CourseCard
