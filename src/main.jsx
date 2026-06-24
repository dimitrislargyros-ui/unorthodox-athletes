import React from 'react'
import ReactDOM from 'react-dom/client'
import ClientApp from './ClientApp.jsx'
import TrainerApp from './TrainerApp.jsx'
import './index.css'

console.log("PATHNAME:",window.location.pathname);const isTrainer = window.location.pathname.startsWith('/trainer')

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null,
    isTrainer ? React.createElement(TrainerApp) : React.createElement(ClientApp)
  )
)
