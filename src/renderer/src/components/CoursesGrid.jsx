import CourseRow from "./CourseRow"
import CourseCard from "./courseCard"

const cursos = []

for (let i = 0; i <= 100; i++) {
  cursos.push(Math.floor(Math.random() * 100))
}

// const cursosList = window.courseList.map((curso) => (
//   <CourseCard
//     key={crypto.randomUUID()}
//     courseTitle={curso}
//     institution={curso.split(" -")[0]}
//     programs={"photoshop"}
//     onClick={() => window.openFolder(`${curso}`)}
//   />
// ))

export default function CoursesGrid({ courses, filterText, isCardLayout }) {
  const courseListCard = []
  const courseListList = []

  courses.forEach((course) => {
    if (window.readJSON(course).title.toLowerCase().indexOf(filterText.toLowerCase()) === -1 &&
      window.readJSON(course).institution.toLowerCase().indexOf(filterText.toLowerCase()) === -1) {
      return
    }
    courseListList.push(
      <CourseRow
        key={crypto.randomUUID()}
        courseTitle={window.readJSON(course).title}
        institution={window.readJSON(course).institution}
        programs={"photoshop"}
        onClick={() => window.openFolder(course)}
      />
    )
  })


  courses.forEach((course) => {
    if (window.readJSON(course).title.toLowerCase().indexOf(filterText.toLowerCase()) === -1 &&
      window.readJSON(course).institution.toLowerCase().indexOf(filterText.toLowerCase()) === -1) {
      return
    }
    courseListCard.push(
      <CourseCard
        key={crypto.randomUUID()}
        courseTitle={window.readJSON(course).title}
        institution={window.readJSON(course).institution}
        programs={"photoshop"}
        onClick={() => window.openFolder(course)}
      />
    )
  })

  courseListCard.sort((a, b) => {
    let fa = a.props.courseTitle.toLowerCase(),
      fb = b.props.courseTitle.toLowerCase()

    if (fa < fb) {
      return -1
    }
    if (fa > fb) {
      return 1
    }
    return 0
  })
  courseListList.sort((a, b) => {
    let fa = a.props.courseTitle.toLowerCase(),
      fb = b.props.courseTitle.toLowerCase()

    if (fa < fb) {
      return -1
    }
    if (fa > fb) {
      return 1
    }
    return 0
  })

  return (
    <div className={`courses-grid${!isCardLayout ? " courses-grid--table" : ""}`}>
      <p style={{ position: "fixed", top: "70px", left: "200px", zIndex: "2" }}>Cursos: {Object.keys(courseList).length}</p>
      {isCardLayout ? courseListCard : courseListList}
    </div>
  )
}
