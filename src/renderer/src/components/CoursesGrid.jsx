import CourseCard from "./courseCard"

const cursos = []

for (let i = 0; i <= 100; i++) {
  cursos.push(Math.floor(Math.random() * 100));
}

const cursosList = cursos.map((curso) => (
  <CourseCard key={crypto.randomUUID()} courseTitle={curso} />
))

export default function CoursesGrid() {
  return <div className="courses-grid">{cursosList}</div>
}
