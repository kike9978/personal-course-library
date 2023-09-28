import CourseRow from "./CourseRow"
import CourseCard from "./courseCard"
import { useEffect, useState } from "react"

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
  const [courseList, setCourseList] = useState([])

  useEffect(() => {
    const filteredCourses = courses.filter(course => { 
      if (window.readJSON(course).title.toLowerCase().indexOf(filterText.toLowerCase()) === -1 &&
        window.readJSON(course).institution.toLowerCase().indexOf(filterText.toLowerCase()) === -1) {
          return true
        }
        return false
      })
      setCourseList(filteredCourses)
  }, [filterText])
  // courses.forEach((course) => {
  //   if (window.readJSON(course).title.toLowerCase().indexOf(filterText.toLowerCase()) === -1 &&
  //     window.readJSON(course).institution.toLowerCase().indexOf(filterText.toLowerCase()) === -1) {
  //     return
  //   }
  //   course = window.readJSON(course)
  //   courseList.push(course)

  //   onSortedCourses(Object.keys(courseList).length)
  // })


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

  sortAlphabetically(courseList)
  return (
    <div className={`courses-grid${!isCardLayout ? " courses-grid--table" : ""}`}>
      {console.log(courseList)}
      {courseList.map(course => {
        // const courseComponent = !isCardLayout ? CourseRow : CourseCard;
        return <courseComponent
          key={crypto.randomUUID()}
          courseTitle={course.title}
          institution={course.institution}
          programs={course.programs}
          onClick={() => window.openFolder(course)} />
      })
    }
    </div>
  )
}
