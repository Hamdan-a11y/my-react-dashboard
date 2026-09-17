import { useState, useEffect } from 'react'
import './Dashboard.css'
import { supabase } from '../supabaseClient'
import { 
  Zap, 
  LogOut, 
  ListTodo, 
  CheckCircle2, 
  TrendingUp, 
  Trash2, 
  Plus, 
  ShieldCheck, 
  Activity, 
  Calendar,
  Sparkles,
  Loader2,
  AlertCircle,
  Clock,
  UserCheck,
  Sun,
  Moon,
  Search,
  X,
  Pencil,
  Check,
  CheckCheck
} from 'lucide-react'

function Dashboard({ session, user, onLogout, theme, toggleTheme }) {
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [newTaskInput, setNewTaskInput] = useState('')

  // 🔍 Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'active' | 'completed'

  // ✏️ Inline Editing State
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editingTaskText, setEditingTaskText] = useState('')

  // ⚡ Batch Action Loading State
  const [isBatchOperating, setIsBatchOperating] = useState(false)

  const userId = session?.user?.id
  const userEmail = session?.user?.email || ''
  const createdAt = session?.user?.created_at
  const lastSignIn = session?.user?.last_sign_in_at

  // 1. Fetch real tasks from Supabase
  const fetchTasks = async () => {
    if (!userId) {
      setLoadingTasks(false)
      return
    }

    setLoadingTasks(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('not find the table')) {
          setTableMissing(true)
        } else {
          setErrorMessage(error.message)
        }
      } else {
        setTasks(data || [])
        setTableMissing(false)
      }
    } catch (err) {
      console.error('Error fetching tasks from Supabase:', err)
      setErrorMessage(err.message || 'Failed to load tasks.')
    } finally {
      setLoadingTasks(false)
    }
  }

  // Initial load + Realtime subscription
  useEffect(() => {
    fetchTasks()

    if (!userId) return

    // Supabase Real-time updates
    const channel = supabase
      .channel(`public:tasks:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchTasks()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // 2. Add real task to Supabase
  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!newTaskInput.trim() || isSubmitting) return

    const taskText = newTaskInput.trim()
    setNewTaskInput('')
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([
          {
            user_id: userId,
            text: taskText,
            completed: false,
          }
        ])
        .select()

      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('not find the table')) {
          setTableMissing(true)
        } else {
          setErrorMessage(error.message)
        }
      } else if (data && data[0]) {
        setTasks(prev => [data[0], ...prev])
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to add task.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 3. Toggle task completion in Supabase
  const toggleTask = async (id, currentStatus) => {
    // Optimistic UI update
    setTasks(prev =>
      prev.map(task =>
        task.id === id ? { ...task, completed: !currentStatus } : task
      )
    )

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ completed: !currentStatus })
        .eq('id', id)

      if (error) {
        // Revert on failure
        setTasks(prev =>
          prev.map(task =>
            task.id === id ? { ...task, completed: currentStatus } : task
          )
        )
        setErrorMessage(error.message)
      }
    } catch (err) {
      setErrorMessage(err.message)
    }
  }

  // 4. Delete task from Supabase
  const handleDeleteTask = async (id) => {
    const previous = [...tasks]
    setTasks(prev => prev.filter(task => task.id !== id))

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)

      if (error) {
        setTasks(previous)
        setErrorMessage(error.message)
      }
    } catch (err) {
      setTasks(previous)
      setErrorMessage(err.message)
    }
  }

  // 5. ✏️ Start Editing Task
  const startEditing = (task) => {
    setEditingTaskId(task.id)
    setEditingTaskText(task.text)
  }

  // 6. ✏️ Cancel Editing Task
  const cancelEditing = () => {
    setEditingTaskId(null)
    setEditingTaskText('')
  }

  // 7. ✏️ Save Edited Task to Supabase
  const saveEditing = async (id) => {
    const trimmed = editingTaskText.trim()
    if (!trimmed) return

    const originalText = tasks.find(t => t.id === id)?.text

    // Optimistic update
    setTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, text: trimmed } : t))
    )
    setEditingTaskId(null)

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ text: trimmed })
        .eq('id', id)

      if (error) {
        // Revert on failure
        setTasks(prev =>
          prev.map(t => (t.id === id ? { ...t, text: originalText } : t))
        )
        setErrorMessage(error.message)
      }
    } catch (err) {
      setErrorMessage(err.message)
    }
  }

  // 8. ⚡ Batch Action: Mark All Active as Done
  const handleMarkAllDone = async () => {
    const activeTasks = tasks.filter(t => !t.completed)
    if (activeTasks.length === 0 || isBatchOperating) return

    const previous = [...tasks]
    // Optimistic update
    setTasks(prev => prev.map(t => ({ ...t, completed: true })))
    setIsBatchOperating(true)

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ completed: true })
        .eq('user_id', userId)
        .eq('completed', false)

      if (error) {
        setTasks(previous)
        setErrorMessage(error.message)
      }
    } catch (err) {
      setTasks(previous)
      setErrorMessage(err.message)
    } finally {
      setIsBatchOperating(false)
    }
  }

  // 9. ⚡ Batch Action: Clear All Completed Tasks
  const handleClearCompleted = async () => {
    const completedTasks = tasks.filter(t => t.completed)
    if (completedTasks.length === 0 || isBatchOperating) return

    if (!window.confirm(`Are you sure you want to delete ${completedTasks.length} completed task(s)?`)) {
      return
    }

    const previous = [...tasks]
    // Optimistic update
    setTasks(prev => prev.filter(t => !t.completed))
    setIsBatchOperating(true)

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('user_id', userId)
        .eq('completed', true)

      if (error) {
        setTasks(previous)
        setErrorMessage(error.message)
      }
    } catch (err) {
      setTasks(previous)
      setErrorMessage(err.message)
    } finally {
      setIsBatchOperating(false)
    }
  }

  // Calculations
  const activeCount = tasks.filter(t => !t.completed).length
  const completedCount = tasks.filter(t => t.completed).length
  const completionRate = tasks.length > 0 
    ? Math.round((completedCount / tasks.length) * 100) 
    : 0

  // 🔎 Filtered Tasks based on active tab and search query
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.text.toLowerCase().includes(searchQuery.toLowerCase().trim())
    if (filterTab === 'active') return matchesSearch && !task.completed
    if (filterTab === 'completed') return matchesSearch && task.completed
    return matchesSearch
  })

  const initials = (user || 'User')
    .split(' ')
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  // Format dates
  const formatDate = (dateString) => {
    if (!dateString) return 'Just now'
    const d = new Date(dateString)
    return d.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div className="dashboard-page">
      {/* Top Navigation Bar */}
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <div className="brand-icon">
            <Zap size={18} />
          </div>
          <span className="brand-name">my-react-app</span>
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

          <div className="user-badge">
            <div className="user-avatar">{initials}</div>
            <span className="user-name">{user || 'User'}</span>
          </div>

          <button 
            className="logout-btn-nav" 
            onClick={onLogout}>
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="dashboard-content">
        {/* Welcome Header */}
        <div className="welcome-header">
          <div className="welcome-title">
            <h1>
              Welcome back, {user || 'User'}!{' '}
              <Sparkles size={22} color="#f59e0b" style={{ display: 'inline', verticalAlign: 'middle' }} />
            </h1>
            <p>
              Connected to <strong>Supabase Cloud</strong> &bull; Authenticated as <code>{userEmail}</code>
            </p>
          </div>

          <div className="status-pill">
            <span className="status-dot"></span>
            Cloud Synced
          </div>
        </div>

        {/* Database Setup Notice if table not created yet */}
        {tableMissing && (
          <div className="db-setup-banner">
            <AlertCircle size={20} color="#f59e0b" style={{ flexShrink: 0 }} />
            <div className="db-setup-text">
              <strong>Supabase Setup Required:</strong> The <code>tasks</code> table has not been created in your Supabase database yet.
              Please go to your Supabase <strong>SQL Editor</strong> and run the provided SQL script to activate cloud task storage.
            </div>
            <button 
              className="refresh-btn" 
              onClick={fetchTasks}
              title="Check again"
            >
              Retry
            </button>
          </div>
        )}

        {errorMessage && !tableMissing && (
          <div className="db-setup-banner error-state">
            <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
            <div className="db-setup-text">
              <strong>Error:</strong> {errorMessage}
            </div>
          </div>
        )}

        {/* Real Stats Grid */}
        <div className="stats-container">
          <div className="stat-box">
            <div className="stat-top">
              <span className="stat-icon">
                <ListTodo size={20} color="#818cf8" />
              </span>
              <span className="stat-tag neutral">In Progress</span>
            </div>
            <h4>Active Tasks</h4>
            <div className="stat-val">{activeCount}</div>
          </div>

          <div className="stat-box">
            <div className="stat-top">
              <span className="stat-icon">
                <CheckCircle2 size={20} color="#4ade80" />
              </span>
              <span className="stat-tag positive">{completionRate}% Done</span>
            </div>
            <h4>Completion Rate</h4>
            <div className="stat-val">{completedCount} / {tasks.length}</div>
          </div>

          <div className="stat-box">
            <div className="stat-top">
              <span className="stat-icon">
                <TrendingUp size={20} color="#38bdf8" />
              </span>
              <span className="stat-tag positive">
                {tasks.length > 0 ? `${tasks.length} Total` : 'Ready'}
              </span>
            </div>
            <h4>Total Cloud Items</h4>
            <div className="stat-val">{tasks.length}</div>
          </div>
        </div>

        {/* 2-Column Section: Task Manager & Real Activity */}
        <div className="dashboard-grid">
          {/* Task Manager Panel */}
          <div className="panel-card">
            <div className="panel-header">
              <h3>Real-Time Cloud Tasks</h3>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {activeCount} remaining
              </span>
            </div>

            {/* Task Add Bar */}
            <form className="task-input-bar" onSubmit={handleAddTask}>
              <input
                type="text"
                placeholder={tableMissing ? "Create table in Supabase first..." : "Add a new task to Supabase..."}
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                disabled={isSubmitting || tableMissing}
              />
              <button 
                type="submit" 
                className="add-task-button"
                disabled={isSubmitting || tableMissing}
              >
                {isSubmitting ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                {isSubmitting ? 'Saving...' : 'Add'}
              </button>
            </form>

            {/* 🔎 Search Bar & Filter Tabs */}
            <div className="tasks-control-bar">
              <div className="tasks-search-box">
                <Search size={15} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    type="button" 
                    className="clear-search-btn"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="filter-tabs">
                <button
                  type="button"
                  className={`filter-tab-btn ${filterTab === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterTab('all')}
                >
                  All ({tasks.length})
                </button>
                <button
                  type="button"
                  className={`filter-tab-btn ${filterTab === 'active' ? 'active' : ''}`}
                  onClick={() => setFilterTab('active')}
                >
                  Active ({activeCount})
                </button>
                <button
                  type="button"
                  className={`filter-tab-btn ${filterTab === 'completed' ? 'active' : ''}`}
                  onClick={() => setFilterTab('completed')}
                >
                  Done ({completedCount})
                </button>
              </div>
            </div>

            {/* Tasks List */}
            {loadingTasks ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-secondary)' }}>
                <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#818cf8' }} />
                Loading your tasks from Supabase...
              </div>
            ) : (
              <>
                <ul className="task-items-list">
                  {filteredTasks.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0', fontSize: '14px' }}>
                      {tableMissing 
                        ? 'Create the table in your Supabase SQL Editor to start saving tasks.'
                        : searchQuery 
                          ? 'No tasks match your search query.'
                          : filterTab === 'completed' 
                            ? 'No completed tasks yet.' 
                            : filterTab === 'active' 
                              ? 'All caught up! No active tasks.' 
                              : 'No tasks found in your database. Add your first task above!'}
                    </p>
                  ) : (
                    filteredTasks.map(task => (
                      <li key={task.id} className="task-row">
                        {editingTaskId === task.id ? (
                          /* ✏️ Inline Editing Mode */
                          <div className="inline-edit-box">
                            <input
                              type="text"
                              className="inline-edit-input"
                              value={editingTaskText}
                              autoFocus
                              onChange={(e) => setEditingTaskText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEditing(task.id)
                                if (e.key === 'Escape') cancelEditing()
                              }}
                            />
                            <button
                              type="button"
                              className="inline-action-btn save"
                              onClick={() => saveEditing(task.id)}
                              title="Save (Enter)"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              type="button"
                              className="inline-action-btn cancel"
                              onClick={cancelEditing}
                              title="Cancel (Esc)"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          /* Standard Row Display */
                          <>
                            <label className="task-left">
                              <input
                                type="checkbox"
                                className="task-checkbox"
                                checked={Boolean(task.completed)}
                                onChange={() => toggleTask(task.id, task.completed)}
                              />
                              <span 
                                className={`task-text ${task.completed ? 'completed' : ''}`}
                                onDoubleClick={() => startEditing(task)}
                                title="Double click to edit"
                              >
                                {task.text}
                              </span>
                            </label>

                            <div className="task-actions-group">
                              <button
                                type="button"
                                className="task-action-btn edit"
                                onClick={() => startEditing(task)}
                                title="Edit task"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                className="task-action-btn delete"
                                onClick={() => handleDeleteTask(task.id)}
                                title="Delete task from cloud"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))
                  )}
                </ul>

                {/* ⚡ Batch Actions Bar */}
                {tasks.length > 0 && (
                  <div className="batch-actions-bar">
                    {activeCount > 0 && (
                      <button
                        type="button"
                        className="batch-action-btn"
                        onClick={handleMarkAllDone}
                        disabled={isBatchOperating}
                      >
                        <CheckCheck size={14} />
                        Mark all done ({activeCount})
                      </button>
                    )}

                    {completedCount > 0 && (
                      <button
                        type="button"
                        className="batch-action-btn danger"
                        onClick={handleClearCompleted}
                        disabled={isBatchOperating}
                      >
                        <Trash2 size={14} />
                        Clear completed ({completedCount})
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Real Activity & Account Information Panel */}
          <div className="panel-card">
            <div className="panel-header">
              <h3>Live Account & Activity</h3>
            </div>

            <div className="activity-list">
              <div className="activity-item">
                <div className="activity-icon">
                  <UserCheck size={16} />
                </div>
                <div className="activity-info">
                  <p>Active Session</p>
                  <span>{userEmail}</span>
                </div>
              </div>

              <div className="activity-item">
                <div className="activity-icon">
                  <ShieldCheck size={16} />
                </div>
                <div className="activity-info">
                  <p>Last Authentication</p>
                  <span>{formatDate(lastSignIn)}</span>
                </div>
              </div>

              <div className="activity-item">
                <div className="activity-icon">
                  <Calendar size={16} />
                </div>
                <div className="activity-info">
                  <p>Member Since</p>
                  <span>{formatDate(createdAt)}</span>
                </div>
              </div>

              <div className="activity-item">
                <div className="activity-icon">
                  <Activity size={16} />
                </div>
                <div className="activity-info">
                  <p>Database Status</p>
                  <span>{tableMissing ? 'Schema Setup Needed' : 'Connected (Real-time Active)'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
