import { useState, useEffect } from 'react'
import { 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  Mail, 
  Lock, 
  ArrowRight,
  Sun,
  Moon,
  ShieldCheck,
  LockKeyhole
} from 'lucide-react'
import emailjs from '@emailjs/browser'
import { supabase } from '../supabaseClient'
import { 
  getSecureItem, 
  setSecureItem, 
  removeSecureItem, 
  calculatePasswordStrength 
} from '../utils/security'
import './Login.css'

// Helper to translate cryptic/technical backend errors into user-friendly messages
const getFriendlyErrorMessage = (rawError) => {
  if (!rawError) return ''
  const msg = typeof rawError === 'string' ? rawError : rawError.message || ''
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login credentials')) {
    return 'Incorrect email or password. Please verify your credentials or reset your password.'
  }
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return 'An account with this email already exists. Please log in instead.'
  }
  if (lower.includes('password should be at least') || lower.includes('password must be at least')) {
    return 'Password must be at least 6 characters long.'
  }
  if (lower.includes('auth session missing') || lower.includes('session missing')) {
    return 'Your reset session has expired or is invalid. Please request a new password reset link below.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Please verify your email address before signing in. Check your inbox.'
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a minute and try again.'
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Network connection error. Please check your internet connection.'
  }
  return msg
}

function Login({ onLogin, isRecoveryMode = false, onPasswordResetComplete, initialError = '', theme, toggleTheme }) {
  const queryParams = new URLSearchParams(window.location.search)
  const resetEmailFromUrl = queryParams.get('email')
  const isDirectReset = queryParams.get('mode') === 'reset' || isRecoveryMode

  const [mode, setMode] = useState(isDirectReset ? 'forgot' : 'login')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // 🛡️ Encrypted client-side storage
  const savedEmail = getSecureItem('rememberedEmail') || ''

  const [email, setEmail] = useState(resetEmailFromUrl || savedEmail)
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(Boolean(savedEmail))
  const [showPassword, setShowPassword] = useState(false)

  // 🛡️ Brute-Force Rate Limiting & Cooldown Engine
  const [failedAttempts, setFailedAttempts] = useState(() => {
    return parseInt(sessionStorage.getItem('auth_failed_attempts') || '0', 10)
  })
  const [lockoutRemaining, setLockoutRemaining] = useState(0)

  useEffect(() => {
    const lockoutUntil = parseInt(sessionStorage.getItem('auth_lockout_until') || '0', 10)
    const now = Date.now()
    if (lockoutUntil > now) {
      setLockoutRemaining(Math.ceil((lockoutUntil - now) / 1000))
    }
  }, [])

  useEffect(() => {
    if (lockoutRemaining <= 0) return
    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          sessionStorage.removeItem('auth_lockout_until')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [lockoutRemaining])

  const recordFailedAttempt = () => {
    const nextAttempts = failedAttempts + 1
    setFailedAttempts(nextAttempts)
    sessionStorage.setItem('auth_failed_attempts', String(nextAttempts))
    if (nextAttempts >= 5) {
      const lockoutExpiry = Date.now() + 60000 // 60s cooldown
      sessionStorage.setItem('auth_lockout_until', String(lockoutExpiry))
      setLockoutRemaining(60)
    }
  }

  const resetFailedAttempts = () => {
    setFailedAttempts(0)
    setLockoutRemaining(0)
    sessionStorage.removeItem('auth_failed_attempts')
    sessionStorage.removeItem('auth_lockout_until')
  }

  // Real-time password evaluation
  const activePassword = mode === 'forgot' ? newPassword : password
  const passwordStrength = calculatePasswordStrength(activePassword)

  const [isSettingNewPassword, setIsSettingNewPassword] = useState(isDirectReset && !initialError)
  const [isSending, setIsSending] = useState(false)

  // Feedback states
  const [generalError, setGeneralError] = useState(initialError)
  const [fieldErrors, setFieldErrors] = useState({})
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (initialError) {
      setGeneralError(initialError)
      setMode('forgot')
      setIsSettingNewPassword(false)
    }
  }, [initialError])

  useEffect(() => {
    if (isRecoveryMode && !initialError) {
      setMode('forgot')
      setIsSettingNewPassword(true)
      setGeneralError('')
      setSuccess('')
    }
  }, [isRecoveryMode, initialError])

  useEffect(() => {
    if (isDirectReset) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [isDirectReset])

  const clearFieldError = (field) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }))
    }
    if (generalError) {
      setGeneralError('')
    }
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    setIsSettingNewPassword(false)
    setGeneralError('')
    setFieldErrors({})
    setSuccess('')
  }

  // 🌐 Real Cloud Google Authentication
  const handleGoogleLogin = async () => {
    setGeneralError('')
    setFieldErrors({})
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (googleError) {
      setGeneralError(getFriendlyErrorMessage(googleError))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGeneralError('')
    setSuccess('')

    // Check brute force lockout
    if (lockoutRemaining > 0) {
      setGeneralError(`Security cooldown active. Please wait ${lockoutRemaining} seconds before trying again.`)
      return
    }

    const errors = {}

    // 1. Validation: First name (signup mode)
    if (mode === 'signup' && !firstName.trim()) {
      errors.firstName = 'First name is required.'
    }

    // 2. Validation: Email
    if (!isSettingNewPassword) {
      const trimmedEmail = email.trim()
      if (!trimmedEmail) {
        errors.email = 'Email address is required.'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        errors.email = 'Please enter a valid email address (e.g. name@example.com).'
      }
    }

    // 3. Validation: Password & Entropy Enforcement (>= 8 chars)
    if (mode === 'login') {
      if (!password) {
        errors.password = 'Password is required.'
      }
    } else if (mode === 'signup') {
      if (!password) {
        errors.password = 'Password is required.'
      } else if (password.length < 8) {
        errors.password = 'Password must be at least 8 characters long.'
      } else if (passwordStrength.score < 2) {
        errors.password = 'Password too weak. Please mix uppercase, numbers, and special characters.'
      }
    } else if (mode === 'forgot' && isSettingNewPassword) {
      if (!newPassword) {
        errors.newPassword = 'New password is required.'
      } else if (newPassword.length < 8) {
        errors.newPassword = 'Password must be at least 8 characters long.'
      } else if (passwordStrength.score < 2) {
        errors.newPassword = 'Password too weak. Please mix uppercase, numbers, and special characters.'
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsSending(true)

    // Handle Encrypted "Remember Me"
    if (rememberMe && email.trim()) {
      setSecureItem('rememberedEmail', email.trim())
    } else {
      removeSecureItem('rememberedEmail')
    }

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) {
          recordFailedAttempt()
          setGeneralError(getFriendlyErrorMessage(signInError))
        } else {
          resetFailedAttempts()
        }
      } else if (mode === 'signup') {
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        })

        if (signUpError) {
          setGeneralError(getFriendlyErrorMessage(signUpError))
        } else if (signUpData?.user && !signUpData.session) {
          setSuccess('Account registered! Please check your email inbox to verify your account.')
        } else {
          resetFailedAttempts()
        }
      } else if (mode === 'forgot') {
        if (isSettingNewPassword) {
          const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword,
          })

          if (updateError) {
            setGeneralError(getFriendlyErrorMessage(updateError))
          } else {
            resetFailedAttempts()
            setSuccess('Password updated successfully! Logging you in...')
            setTimeout(() => {
              if (onPasswordResetComplete) {
                onPasswordResetComplete()
              } else {
                setMode('login')
                setIsSettingNewPassword(false)
                setPassword('')
                setNewPassword('')
              }
            }, 1200)
          }
        } else {
          const redirectUrl = `${window.location.origin}/?mode=reset`
          const { error: resetError } = await supabase.auth.resetPasswordForEmail(
            email.trim(),
            { redirectTo: redirectUrl }
          )

          if (resetError) {
            setGeneralError(getFriendlyErrorMessage(resetError))
          } else {
            setSuccess(`A secure reset link has been dispatched to ${email.trim()}. Check your inbox.`)
          }
        }
      }
    } catch (err) {
      setGeneralError('An unexpected error occurred. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  const isSignupPasswordValid = password.length >= 6

  return (
    <div className="auth-page">
      {/* Precision Top Navigation Bar (Identical to Dashboard) */}
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <span className="brand-name">React Dashboard</span>
        </div>

        <div className="nav-user-area">
          {toggleTheme && (
            <button 
              className="theme-toggle-nav" 
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={17} className="theme-icon" /> : <Moon size={17} className="theme-icon" />}
            </button>
          )}
        </div>
      </nav>

      <div className="auth-content-container">
        <div className="auth-center-card">
          {/* Top Segmented Mode Switcher (Linear / Vercel style) */}
        {mode !== 'forgot' && (
          <div className="auth-segmented-tabs">
            <button
              type="button"
              className={`auth-segment-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => handleModeChange('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-segment-btn ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => handleModeChange('signup')}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Card Brand Header */}
        <div className="auth-header-block">
          <h2 className="auth-title">
            {mode === 'signup' && 'Create your account'}
            {mode === 'login' && 'Welcome back'}
            {mode === 'forgot' && (isSettingNewPassword ? 'Set new password' : 'Reset your password')}
          </h2>
          
          <p className="auth-subtext">
            {mode === 'signup' && 'Start organizing your cloud tasks with real-time sync.'}
            {mode === 'login' && 'Access your workspace and real-time cloud tasks.'}
            {mode === 'forgot' && (isSettingNewPassword 
              ? 'Enter your new password to secure your account.' 
              : 'Enter your email to receive a secure recovery link.')}
          </p>
        </div>

        {/* System Alert Banners */}
        {generalError && (
          <div className="auth-msg error">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{generalError}</span>
          </div>
        )}
        {success && (
          <div className="auth-msg success">
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Sign Up: First Name & Last Name Fields */}
          {mode === 'signup' && (
            <div className="input-row-container">
              <div className="input-row">
                <div className={`input-with-icon ${fieldErrors.firstName ? 'has-error' : ''}`}>
                  <User size={15} className="field-icon" />
                  <input
                    type="text"
                    className="auth-input-field"
                    placeholder="First Name"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value)
                      clearFieldError('firstName')
                    }}
                  />
                </div>
                <div className="input-with-icon">
                  <User size={15} className="field-icon" />
                  <input
                    type="text"
                    className="auth-input-field"
                    placeholder="Last Name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              {fieldErrors.firstName && (
                <div className="field-error-msg">
                  <AlertCircle size={13} />
                  <span>{fieldErrors.firstName}</span>
                </div>
              )}
            </div>
          )}

          {/* Email Field (All modes except direct password update) */}
          {!isSettingNewPassword && (
            <div className="field-group">
              <div className={`input-with-icon ${fieldErrors.email ? 'has-error' : ''}`}>
                <Mail size={15} className="field-icon" />
                <input
                  type="email"
                  className="auth-input-field"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    clearFieldError('email')
                  }}
                />
              </div>
              {fieldErrors.email && (
                <div className="field-error-msg">
                  <AlertCircle size={13} />
                  <span>{fieldErrors.email}</span>
                </div>
              )}
            </div>
          )}

          {/* Direct Reset: New Password */}
          {mode === 'forgot' && isSettingNewPassword && (
            <div className="field-group">
              <div className={`input-with-icon password-box ${fieldErrors.newPassword ? 'has-error' : ''}`}>
                <Lock size={15} className="field-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input-field"
                  placeholder="New password (min 6 chars)"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    clearFieldError('newPassword')
                  }}
                />
                <button
                  type="button"
                  className="eye-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.newPassword && (
                <div className="field-error-msg">
                  <AlertCircle size={13} />
                  <span>{fieldErrors.newPassword}</span>
                </div>
              )}
            </div>
          )}

          {/* Standard Password Field */}
          {mode !== 'forgot' && (
            <div className="field-group">
              <div className={`input-with-icon password-box ${fieldErrors.password ? 'has-error' : ''}`}>
                <Lock size={15} className="field-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input-field"
                  placeholder={mode === 'signup' ? 'Create password' : 'Enter password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    clearFieldError('password')
                  }}
                />
                <button
                  type="button"
                  className="eye-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Real-time Password Strength Segmented Meter for Sign Up */}
              {mode === 'signup' && password.length > 0 && (
                <div className="password-strength-container">
                  <div className="password-strength-bar">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`strength-segment ${passwordStrength.score >= step ? `active tier-${passwordStrength.score}` : ''}`}
                      />
                    ))}
                  </div>
                  <div className="password-strength-labels">
                    <span>Password Security:</span>
                    <strong className={`tier-label tier-${passwordStrength.score}`}>
                      {passwordStrength.label || 'Enter 8+ characters'}
                    </strong>
                  </div>
                </div>
              )}

              {fieldErrors.password && (
                <div className="field-error-msg">
                  <AlertCircle size={13} />
                  <span>{fieldErrors.password}</span>
                </div>
              )}
            </div>
          )}

          {/* Remember Me & Forgot Password Row */}
          {mode === 'login' && (
            <div className="options-row">
              <label className="terms-row">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                className="forgot-link-btn"
                onClick={() => handleModeChange('forgot')}
              >
                Forgot password?
              </button>
            </div>
          )}

          {mode === 'signup' && (
            <div className="options-row signup-terms">
              <label className="terms-row">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>
            </div>
          )}

          {/* Lockout Warning Banner */}
          {lockoutRemaining > 0 && (
            <div className="auth-msg warning">
              <ShieldCheck size={16} style={{ flexShrink: 0 }} />
              <span>Brute-force protection active. Cooldown remaining: {lockoutRemaining}s</span>
            </div>
          )}

          {/* Main Action Button */}
          <button 
            type="submit" 
            className="main-auth-btn"
            disabled={isSending || lockoutRemaining > 0}
          >
            {isSending ? (
              <span>Processing...</span>
            ) : lockoutRemaining > 0 ? (
              <span>Locked ({lockoutRemaining}s)</span>
            ) : (
              <>
                <span>
                  {mode === 'login' && 'Sign In to Workspace'}
                  {mode === 'signup' && 'Create Free Account'}
                  {mode === 'forgot' && (isSettingNewPassword ? 'Update Password' : 'Send Recovery Link')}
                </span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Back to Login for Forgot Password Mode */}
          {mode === 'forgot' && (
            <div className="forgot-back-row">
              <button
                type="button"
                className="forgot-link-btn"
                onClick={() => handleModeChange('login')}
              >
                &larr; Back to sign in
              </button>
            </div>
          )}

          {/* OAuth Social Providers */}
          {mode !== 'forgot' && (
            <>
              <div className="social-divider">
                <span>Or continue with</span>
              </div>

              <div className="social-row">
                <button
                  type="button"
                  className="social-outline-btn google full-width"
                  onClick={handleGoogleLogin}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17 1.8 14.7 1 12 1 7.5 1 3.7 3.6 1.9 7.4l3.6 2.8C6.4 7.2 9 5 12 5z"/>
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                    <path fill="#FBBC05" d="M5.5 14.8c-.2-.7-.4-1.5-.4-2.8s.1-2.1.4-2.8L1.9 6.4C.7 8.8 0 10.4 0 12s.7 3.2 1.9 5.6l3.6-2.8z"/>
                    <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.6-2.2-6.5-5.2L1.9 16C3.7 19.8 7.5 23 12 23z"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  </div>
  )
}

export default Login
