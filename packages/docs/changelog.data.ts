import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import MarkdownIt from 'markdown-it'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})

export default {
  load() {
    const changelogPath = path.resolve(__dirname, '../storion/CHANGELOG.md')
    const content = fs.readFileSync(changelogPath, 'utf-8')
    // Remove the title since we have our own
    const markdown = content.replace(/^# Changelog\n+/, '')
    // Convert markdown to HTML
    return md.render(markdown)
  }
}

