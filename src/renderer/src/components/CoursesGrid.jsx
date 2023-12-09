import CourseRow from "./CourseRow"
import CourseCard from "./courseCard"
import { imageData } from "../utils/imageData"
import CourseEditModal from "./CourseEditModal"
import { useState } from "react"

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

export default function CoursesGrid({ courses, filterText, isCardLayout, isInProcessOnly, onSortedCourses }) {
  const [modalCourseTitle, setModalCourseTitle] = useState("")
  const [modalProgramsList, setModalProgramsList] = useState([])
  const [currentCoursePath, setCurrentCoursePath] = useState("")
  const courseListCard = []
  const courseListList = []

  courses.forEach((course) => {
    const courseObject = window.readJSON(course)
    if (courseObject.title.toLowerCase().indexOf(filterText.toLowerCase()) === -1 &&
      courseObject.institution.toLowerCase().indexOf(filterText.toLowerCase()) === -1) {
      return
    }

    if (isInProcessOnly && !courseObject.isInProcess) {
      return
    }

    let imgUrl = ""
    imageData.forEach((data) => {
      const { institution, img } = data
      if (courseObject.institution.toLowerCase() !== institution.toLowerCase()) {
        return
      }

      imgUrl = img
    })
    courseListList.push(
      <CourseRow
        key={crypto.randomUUID()}
        courseTitle={courseObject.title}
        institution={imgUrl}
        programs={courseObject.programs}
        onClick={() => window.openFolder(course)}
      />
    )
    onSortedCourses(Object.keys(courseListList).length)
    courseListCard.push(
      <CourseCard
        key={crypto.randomUUID()}
        courseTitle={courseObject.title}
        institution={imgUrl}
        programs={courseObject.programs}
        onClick={() => {
          window.openFolder(course)
        }}
        isInProcess={courseObject.isInProcess}
        coursePath={course}
        onOpenModalClick={() => {
          setModalCourseTitle(courseObject.title)
          setModalProgramsList(courseObject.programs)
          setCurrentCoursePath(`${window.extensions.macos}${course}/courseProps.json`)
        }}
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
    <>
      <div className={`courses-grid${!isCardLayout ? " courses-grid--table" : ""}`}>
        {isCardLayout ? courseListCard : courseListList}
      </div>
      <CourseEditModal
        path={currentCoursePath}
        courseTitle={modalCourseTitle}
        onCourseTitleChange={setModalCourseTitle}
        programsList={modalProgramsList}
        onProgramsListChange={setModalProgramsList}
      />
    </>
  )
}
