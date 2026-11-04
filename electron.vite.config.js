import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // Bundle archiver. electron-builder's dependency walker omits pieces of
    // its tree (archiver-utils, and under Bun the rest of the chain), so a
    // packaged app crashes on require('archiver-utils') from zip-stream.
    plugins: [externalizeDepsPlugin({ exclude: ['archiver'] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
