import CourseCard from "./courseCard"


console.table(window.courseList)
console.table(window.courseList2)

const cursos = []

for (let i = 0; i <= 100; i++) {
  cursos.push(Math.floor(Math.random() * 100))
}

const cursosList = window.courseList2.map((curso) => (
  <CourseCard
    key={crypto.randomUUID()}
    courseTitle={curso}
    institution={curso}
    programs={curso}
    onClick={() => window.openFolder(`${curso}`)}
  />
))

export default function CoursesGrid() {
  return <div className="courses-grid">{cursosList}</div>
}
