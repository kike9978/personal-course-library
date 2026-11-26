/**
 * What to say when a note, card or project points at a course that is not in the catalog.
 * With no courses at all, the course folder is most likely not connected yet.
 */
export function courseMissingMessage(courses) {
  return courses?.length
    ? 'Curso no encontrado en la biblioteca'
    : 'Conecta la carpeta de cursos en Biblioteca para abrir el curso'
}
