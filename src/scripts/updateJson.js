const fs = require('fs')

export function updateInProcessState(coursePath) {
  console.log(coursePath)
  const file = require(coursePath)
  file.isInProcess = !file.isInProcess
  fs.writeFileSync(coursePath, JSON.stringify(file), function writeJSON(err) {
    if (err) return console.log(err)
  })
}

export function updateCourseProgramsList(coursePath, newList) {
  console.log(coursePath)
  console.log(newList)
  const file = require(coursePath)
  file.programs = newList
  fs.writeFileSync(coursePath, JSON.stringify(file), function writeJSON(err) {
    if (err) return console.log(err)
  })
}
