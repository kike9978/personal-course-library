
function CourseEditModal({ path, courseTitle, onCourseTitleChange, programsList, onProgramsListChange }) {


  return (
    <dialog className="dialog">
      <h3>Editar propiedades de curso</h3>
      <label>
        Nombre de curso:
        <textarea
          value={courseTitle}
          onChange={(e) => {
            onCourseTitleChange(e.target.value)
          }}
        // onBlur={ }
        />
      </label>
      <label>
        Programas:
        <input
          type="text"
          value={programsList}
          onChange={(e) => {
            onProgramsListChange(e.target.value)
          }}
          className="program-list-input"
        />
        <button onClick={() => {
          window.updateCourseProgramsList(path, document.querySelector(".program-list-input").value.split(","))
          console.log("me picaste la cola")
          console.log(path)
          console.log(document.querySelector(".program-list-input").value.split(","))
        }}
        >Actualizar programs</button>
      </label>
      <label>
        Instructor:
        <input type="text" value="hola" />
      </label>
      <label>
        Academia:
        <input type="text" value="hola" />
      </label>
      <button onClick={() => {
        document.querySelector(".dialog").close()
      }}>x</button>
    </dialog >
  )
}

export default CourseEditModal
