const fs = require("fs");
const path = require("path");

export default function courseList() {
  const results = fs.readdirSync(path.resolve(__dirname, "/Volumes/MacWin/Cursos/_All Courses/"))
  return results
}
