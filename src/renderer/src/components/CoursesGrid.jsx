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

export default function CoursesGrid({ courses, filterText }) {
  const courseList = []
  // const courseListShorten = []

  // courses.forEach((course) => {
  //   const object = { titulo: "", institution: "" }
  //   object.titulo = course.split(" - ")[1].trim()
  //   object.institution = course.split(" - ")[0].trim()
  //   courseListShorten.push(object)
  // })

  // courseListShorten.sort((a, b) => {
  //   let fa = a.titulo.toLowerCase(),
  //     fb = b.titulo.toLowerCase();

  //   if (fa < fb) {
  //     return -1;
  //   }
  //   if (fa > fb) {
  //     return 1;
  //   }
  //   return 0;
  // })

  courses.forEach((course) => {
    if (window.readJSON(course).title.toLowerCase().indexOf(filterText.toLowerCase()) === -1 &&
      window.readJSON(course).institution.toLowerCase().indexOf(filterText.toLowerCase()) === -1) {
      return
    }
    courseList.push(
      <CourseCard
        key={crypto.randomUUID()}
        courseTitle={window.readJSON(course).title}
        institution={window.readJSON(course).institution}
        programs={"photoshop"}
        onClick={() => window.openFolder(course)}
      />
    )
  })

  return (
    <div className="courses-grid">
      <p style={{ position: "fixed", top: "70px", left: "200px", zIndex: "2" }}>Cursos: {Object.keys(courseList).length}</p>
      {courseList}
    </div>
  )
}
