import coverImage from '../assets/img/coverimage-test.svg'
const institutionImages = import.meta.glob("/src/assets/img/institutions/*.{jpeg,jpeg,png,gif,webp}", { eager: true, as: 'url' })

function CourseRow({ courseTitle, institution, programs, onClick, institutionImgUrl }) {
  const programChips = programs.map((program) => {
    return (
      <div key={crypto.randomUUID} className="badge badge--programs">
        <span>{program}</span>
      </div>
    )
  })
  return (
    <button onClick={onClick} href="./" className="course-row">
      <img
        src={coverImage}
        alt="course thumbnail"
        className={`img-color--${Math.floor(Math.random() * 15) + 1}`}
      />
      <h3 title={courseTitle}>{courseTitle && courseTitle}</h3>
      <img className="institution-logo" alt={`${institution} logo`} src={institutionImages[institutionImgUrl]} />
      {programChips}
      <div className="completion-rate">100%</div>
    </button>
  )
}

export default CourseRow
