import React from 'react'
import ReactDOM from 'react-dom/client'
import ClientApp from './ClientApp.jsx'
import TrainerApp from './TrainerApp.jsx'
import ResetPassword from './ResetPassword.jsx'
import './index.css'

console.log("PATHNAME:",window.location.pathname);
const path = window.location.pathname
const isResetPassword = path.startsWith('/reset-password')
const isTrainer = path.startsWith('/trainer')

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null,
    isResetPassword ? React.createElement(ResetPassword) :
    isTrainer ? React.createElement(TrainerApp) : React.createElement(ClientApp)
  )
)
