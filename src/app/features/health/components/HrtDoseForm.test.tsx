// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HrtDoseForm } from './HrtDoseForm'

afterEach(cleanup)

describe('HrtDoseForm route-dependent interactions', () => {
  it('starts with the upstream transfem sublingual EV defaults', () => {
    render(<HrtDoseForm onSave={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'estradiol' })).toHaveClass(
      'active',
    )
    expect(screen.getByLabelText('route')).toHaveValue('sublingual')
    expect(screen.getByLabelText('formulation')).toHaveValue('EV')
    expect(screen.getByText('absorption')).toBeInTheDocument()
    expect(screen.getByLabelText('Estradiol valerate / mg')).toBeInTheDocument()
  })

  it('changes all visible fields when switching to patch application', async () => {
    const user = userEvent.setup()
    render(<HrtDoseForm onSave={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('route'), 'patchApply')

    await waitFor(() => {
      expect(screen.queryByLabelText('formulation')).not.toBeInTheDocument()
      expect(screen.getByText('patch input')).toBeInTheDocument()
      expect(
        screen.getByLabelText('release rate / µg per day'),
      ).toBeInTheDocument()
      expect(
        screen.getByLabelText('planned wear / days (optional)'),
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText('Estradiol valerate / mg'),
      ).not.toBeInTheDocument()
    })
  })

  it('retains rate and total-dose values across the patch input toggle', async () => {
    const user = userEvent.setup()
    render(<HrtDoseForm onSave={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText('route'), 'patchApply')

    const rate = await screen.findByLabelText('release rate / µg per day')
    await user.type(rate, '50')
    await user.click(screen.getByRole('button', { name: 'total dose' }))

    const total = screen.getByLabelText('total patch dose / mg')
    await user.type(total, '4')
    await user.click(screen.getByRole('button', { name: 'release rate' }))
    expect(screen.getByLabelText('release rate / µg per day')).toHaveValue(50)

    await user.click(screen.getByRole('button', { name: 'total dose' }))
    expect(screen.getByLabelText('total patch dose / mg')).toHaveValue(4)
  })

  it('cascades transmasc mode to injection and testosterone esters', async () => {
    const user = userEvent.setup()
    render(<HrtDoseForm onSave={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'testosterone' }))

    await waitFor(() => {
      const route = screen.getByLabelText('route') as HTMLSelectElement
      expect(route).toHaveValue('injection')
      expect([...route.options].map((option) => option.value)).toEqual([
        'injection',
        'gel',
      ])
      expect(screen.getByLabelText('formulation')).toHaveValue('TC')
    })
  })

  it('changes gel fields and bioavailability with application site', async () => {
    const user = userEvent.setup()
    render(<HrtDoseForm onSave={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText('route'), 'gel')

    await waitFor(() => {
      expect(screen.getByText('application site')).toBeInTheDocument()
      expect(screen.getByText(/bioavailability: 5%/)).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'scrotal' }))
    expect(screen.getByText(/bioavailability: 25%/)).toBeInTheDocument()
  })

  it('hides dose fields for patch removal and emits a zero-dose event', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<HrtDoseForm onSave={onSave} />)

    await user.selectOptions(screen.getByLabelText('route'), 'patchRemove')
    expect(
      screen.getByText(/active estradiol patch is removed/),
    ).toBeInTheDocument()
    expect(screen.queryByText('patch input')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/mg$/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'record dose' }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'patchRemove',
        formulation: 'E2',
        medication: 'estradiol',
        dose: 0,
        extras: {},
      }),
    )
  })

  it('shows only raw CPA dose for oral cyproterone', async () => {
    const user = userEvent.setup()
    render(<HrtDoseForm onSave={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('route'), 'oral')
    await user.selectOptions(screen.getByLabelText('formulation'), 'CPA')

    expect(
      screen.getByLabelText('Cyproterone acetate / mg'),
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText('E2 equivalent / mg'),
    ).not.toBeInTheDocument()
  })

  it('switches sublingual presets to custom hold without losing preset state', async () => {
    const user = userEvent.setup()
    render(<HrtDoseForm onSave={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'strict / 15 min' }))
    await user.click(
      screen.getByRole('button', { name: 'use custom hold time' }),
    )
    const hold = screen.getByLabelText('hold time / min')
    await user.clear(hold)
    await user.type(hold, '20')
    expect(screen.getByText(/θ ≈/)).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'use absorption presets' }),
    )
    expect(screen.getByRole('button', { name: 'strict / 15 min' })).toHaveClass(
      'active',
    )
  })

  it('preserves HRT fields while toggling to medication tracking and back', async () => {
    const user = userEvent.setup()
    render(<HrtDoseForm onSave={vi.fn()} />)
    await user.type(screen.getByLabelText('Estradiol valerate / mg'), '4')

    await user.click(screen.getByRole('button', { name: 'meds' }))
    expect(screen.getByLabelText('medication')).toHaveValue('methylphenidate')
    expect(screen.queryByLabelText('route')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'HRT' }))
    expect(screen.getByLabelText('route')).toHaveValue('sublingual')
    expect(screen.getByLabelText('Estradiol valerate / mg')).toHaveValue(4)
  })
})
