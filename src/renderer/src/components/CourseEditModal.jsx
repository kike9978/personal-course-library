
function CourseEditModal({courseTitle, onCourseTitleChange}) {

  return (
    <dialog className="dialog">
      <h3>Editar propiedades de curso</h3>
      <label>
        Nombre de curso:
        <input
          type="text"
          value={courseTitle}
          onChange={(e) => {
            onCourseTitleChange(e.target.value)
          }}
        // onBlur={ }
        />
      </label>
      <label>
        Programas:
        <input type="text" value="hola" />
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
    </dialog>
  )
}

export default CourseEditModal
