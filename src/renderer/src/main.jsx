import React from 'react'
import ReactDOM from 'react-dom/client'
import './assets/reset.css'
import './assets/index.css'
import App from './App'

// Excalidraw fonts are copied to renderer public/fonts
window.EXCALIDRAW_ASSET_PATH = import.meta.env.BASE_URL || './'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
