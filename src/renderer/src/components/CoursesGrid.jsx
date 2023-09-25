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

  courses.forEach((course) => {
    if (
      course.toLowerCase().indexOf(
        filterText.toLowerCase()
      ) === -1
    ) {
      return;
    }
    courseList.push(
      <CourseCard
        key={crypto.randomUUID()}
        courseTitle={course}
        institution={course.split(" -")[0]}
        programs={"photoshop"}
        onClick={() => window.openFolder(`${course}`)}
      />
    );
  });

  return <div className="courses-grid">{courseList}</div>
}
