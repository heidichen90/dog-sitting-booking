import { Component, type ReactNode } from 'react'
import { Alert, Button } from '@mui/material'

interface DashboardErrorBoundaryProps {
  children: ReactNode
}

interface DashboardErrorBoundaryState {
  failed: boolean
}

// Loading the lazy Dashboard fails if the site was redeployed since the page opened; without this the whole app blanks.
export default class DashboardErrorBoundary extends Component<DashboardErrorBoundaryProps, DashboardErrorBoundaryState> {
  state: DashboardErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): DashboardErrorBoundaryState {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      >
        Couldn't load the dashboard.
      </Alert>
    )
  }
}
