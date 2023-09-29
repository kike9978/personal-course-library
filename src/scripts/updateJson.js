const fs = require('fs')

export default function updateInProgressState(coursePath) {
  const file = require(coursePath)
  file.isInProcess = !file.isInProcess
  fs.writeFile(coursePath, JSON.stringify(file), function writeJSON(err) {
    if (err) return console.log(err)
    console.log(JSON.stringify(file))
    console.log('writing to ' + coursePath)
  })
}
