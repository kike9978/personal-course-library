const fs = require('fs')
const path = require('path')

export const extensions = {
  windows: 'E:\\Cursos\\_All Courses\\',
  macos: `/Volumes/MacWin/Cursos/_All Courses/`
}

export function readJSON(extension) {
  const letData = fs.readFileSync(`${extensions.macos}${extension}/courseProps.json`)
  let props = JSON.parse(letData)
  return props
}
export function isCoverImg(extension) {
  fs.existsSync(`${extensions.macos}${extension}/cover.png`)
  console.log(fs.existsSync(`${extensions.macos}${extension}/cover.png`))
  if (fs.existsSync(`${extensions.macos}${extension}/cover.png`)) {
    console.log(fs.readFileSync(`${extensions.macos}${extension}/cover.png`))
  }
}
export function readCoverImg(extension) {
  const imgPath =`${extensions.macos}${extension}/cover.png`
  fs.readFileSync(imgPath, (err, data) => {
    // error handle
    if (err) {
      throw err
    }

    // get image file extension name
    const extensionName = path.extname(imgPath)

    // convert image file to base64-encoded string
    const base64Image = Buffer.from(data, 'binary').toString('base64')

    // combine all strings
    const base64ImageStr = `data:image/${extensionName.split('.').pop()};base64,${base64Image}`
    fs.readFileSync(base64ImageStr)
  })
}

export default function courseList() {
  const results = fs.readdirSync(path.resolve(__dirname, `${extensions.macos}`))
  return results
}

// /Volumes/MacWin/Cursos/_All Courses/21Draw - Digital Illustration for Beginners by Laia Lopez
