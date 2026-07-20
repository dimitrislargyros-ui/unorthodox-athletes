import React from 'react'
import ReactDOM from 'react-dom/client'
import ClientApp from './ClientApp.jsx'
import TrainerApp from './TrainerApp.jsx'
import ResetPassword from './ResetPassword.jsx'
import './index.css'

const path = window.location.pathname
const isResetPassword = path.startsWith('/reset-password')
// VITE_FORCE_TRAINER=true forces trainer app (used for trainer-specific Vercel deployment)
const forceTrainer = import.meta.env.VITE_FORCE_TRAINER === 'true'
const isTrainer = forceTrainer || path.startsWith('/trainer')

ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(React.StrictMode, null,
                            isResetPassword ? React.createElement(ResetPassword) :
                            isTrainer ? React.createElement(TrainerApp) : React.createElement(ClientApp)
                          )
  )
