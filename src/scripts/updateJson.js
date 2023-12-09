const fs = require('fs')

export default function updateInProcessState(coursePath) {
  const file = require(coursePath)
  file.isInProcess = !file.isInProcess
  console.log(file.isInProcess)
  fs.writeFileSync(coursePath, JSON.stringify(file), function writeJSON(err) {
    if (err) return console.log(err)
  })
}
