import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
  load() {
    const changelogPath = path.resolve(__dirname, '../storion/CHANGELOG.md')
    const content = fs.readFileSync(changelogPath, 'utf-8')
    // Remove the title since we have our own
    return content.replace(/^# Changelog\n+/, '')
  }
}

