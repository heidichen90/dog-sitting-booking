import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardErrorBoundary from './DashboardErrorBoundary.tsx'

function Broken(): never {
  throw new Error('Failed to fetch dynamically imported module')
}

describe('DashboardErrorBoundary', () => {
  it('shows its children when nothing fails', () => {
    render(
      <DashboardErrorBoundary>
        <p>Grid</p>
      </DashboardErrorBoundary>,
    )

    expect(screen.getByText('Grid')).toBeTruthy()
  })

  it('shows a reload prompt instead of blanking the page when the dashboard fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <DashboardErrorBoundary>
        <Broken />
      </DashboardErrorBoundary>,
    )

    expect(screen.getByRole('alert').textContent).toContain("Couldn't load the dashboard.")
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })
})
