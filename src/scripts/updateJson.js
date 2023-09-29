const fs = require('fs')

export default function updateInProcessState(coursePath) {
  console.log("Primer log ")
  const file = require(coursePath)
  console.log("Soy el archivo ", file)
  file.isInProcess = !file.isInProcess
  fs.writeFile(coursePath, JSON.stringify(file), function writeJSON(err) {
    if (err) return console.log(err)
    console.log(JSON.stringify(file))
    console.log('writing to ' + coursePath)
  })
}
