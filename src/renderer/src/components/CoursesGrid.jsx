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

export default function CoursesGrid({ courses, filterText, isCardLayout, onSortedCourses }) {
  const courseListCard = []
  const courseListList = []
  console.log("courses es  ", typeof(courses))

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
        programs={window.readJSON(course).programs}
        onClick={() => window.openFolder(course)}
      />
    )
    onSortedCourses(Object.keys(courseListList).length)
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
        programs={window.readJSON(course).programs}
        onClick={() => window.openFolder(course)}
      />
    )
    onSortedCourses(Object.keys(courseListCard).length)
  })

  function sortAlphabetically(list) {
    list.sort((a, b) => {
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
  }

  sortAlphabetically(courseListCard)
  sortAlphabetically(courseListList)
  return (
    <div className={`courses-grid${!isCardLayout ? " courses-grid--table" : ""}`}>
      {isCardLayout ? courseListCard : courseListList}
    </div>
  )
}
