import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import BookingForm from './BookingForm.tsx'
import Providers from '../test/Providers.tsx'
import { server } from '../test/server.ts'
import { booking, clients } from '../test/fixtures.ts'
import type { Client, CreateBookingRequest } from '../types'

const problemHeaders = { 'Content-Type': 'application/problem+json' }

function renderForm(clientList: Client[] = clients) {
  const onCreated = vi.fn()
  render(<BookingForm clients={clientList} onCreated={onCreated} />, { wrapper: Providers })
  return { user: userEvent.setup(), onCreated }
}

function captureCreate(): CreateBookingRequest[] {
  const requests: CreateBookingRequest[] = []
  server.use(
    http.post('/api/bookings', async ({ request }) => {
      requests.push((await request.json()) as CreateBookingRequest)
      return HttpResponse.json(booking, { status: 201 })
    }),
  )
  return requests
}

// MUI X pickers keep a hidden <input> (the one the label points at) whose change event parses the field's text format.
function setDate(label: string, day: number, value: string) {
  fireEvent.change(screen.getAllByLabelText(label, { selector: 'input' })[day], { target: { value } })
}

function fillDay(day: number, dropOff: string, pickUp: string) {
  setDate('Drop-off Date', day, dropOff)
  setDate('Pick-up Date', day, pickUp)
}

const owner = () => screen.getByRole('combobox', { name: 'Owner' }) as HTMLInputElement
const dog = () => screen.getByRole('combobox', { name: 'Dog' }) as HTMLInputElement
const phone = () => screen.queryByLabelText('Phone (optional)') as HTMLInputElement | null

async function pickClient(user: UserEvent, typed: string, name: string) {
  await user.type(owner(), typed)
  await user.click(screen.getByRole('option', { name: new RegExp(name) }))
}

async function pickDog(user: UserEvent, typed: string, name: string) {
  await user.type(dog(), typed)
  await user.click(screen.getByRole('option', { name }))
}

const submit = (user: UserEvent) => user.click(screen.getByRole('button', { name: 'Create Booking' }))

describe('client and dog pickers', () => {
  it('suggests clients matching what is typed', async () => {
    const { user } = renderForm()

    await user.type(owner(), 'sar')

    expect(screen.getByRole('option', { name: /Sarah Lee/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Tom Hall/ })).toBeNull()
  })

  it('suggests clients ignoring case and extra spaces, like the duplicate warning', async () => {
    const { user } = renderForm()

    await user.type(owner(), '  sarah   LEE ')

    expect(screen.getByRole('option', { name: /Sarah Lee/ })).toBeTruthy()
  })

  it('sends a picked client and dog as ids', async () => {
    const requests = captureCreate()
    const { user, onCreated } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    expect(phone()).toBeNull()
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(booking))
    expect(requests[0].client).toEqual({ id: 1 })
    expect(requests[0].dog).toEqual({ id: 11 })
    expect(requests[0].stays).toEqual([
      {
        dropOffDate: '2030-11-02',
        dropOffTime: null,
        pickUpDate: '2030-11-04',
        pickUpTime: null,
        unitRate: 40,
        pickupDropoffFee: 0,
      },
    ])
  })

  it('sends HH:mm times when Times TBD is unticked', async () => {
    const requests = captureCreate()
    const { user } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    await user.click(screen.getByRole('checkbox', { name: /Times TBD/ }))
    setDate('Drop-off Date & Time', 0, '02/11/2030 09:00')
    setDate('Pick-up Date & Time', 0, '02/11/2030 17:30')
    await submit(user)

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].stays[0]).toEqual({
      dropOffDate: '2030-11-02',
      dropOffTime: '09:00',
      pickUpDate: '2030-11-02',
      pickUpTime: '17:30',
      unitRate: 35,
      pickupDropoffFee: 0,
    })
  })

  it('reveals Phone for a new client and sends name and phone', async () => {
    const requests = captureCreate()
    const { user } = renderForm()
    expect(phone()).toBeNull()

    await user.type(owner(), 'Jane Doe')
    await user.type(phone() as HTMLInputElement, '07700 900456')
    await user.type(dog(), 'Rolo')
    fillDay(0, '02/11/2030', '02/11/2030')
    await submit(user)

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].client).toEqual({ name: 'Jane Doe', phone: '+447700900456' })
    expect(requests[0].dog).toEqual({ name: 'Rolo' })
  })

  it('rejects a phone that is not a UK mobile or international number, sending nothing', async () => {
    const requests = captureCreate()
    const { user } = renderForm()

    await user.type(owner(), 'Jane Doe')
    await user.type(phone() as HTMLInputElement, '020 7946 0000')
    await user.type(dog(), 'Rolo')
    fillDay(0, '02/11/2030', '02/11/2030')
    await submit(user)

    expect(await screen.findByText('Enter a UK mobile or international number')).toBeTruthy()
    expect(requests).toHaveLength(0)
  })

  it("lists only the chosen client's dogs", async () => {
    const { user } = renderForm()

    await pickClient(user, 'tom', 'Tom Hall')
    await user.type(dog(), 'r')
    expect(screen.getByRole('option', { name: 'Rex' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Pepper' })).toBeNull()
    await user.click(screen.getByRole('option', { name: 'Rex' }))

    await user.click(owner())
    await user.keyboard('{ArrowDown}')
    await user.click(screen.getByRole('option', { name: /Sarah Lee/ }))
    expect(owner().value).toBe('Sarah Lee')
    expect(dog().value).toBe('')

    await user.type(dog(), 'r')
    expect(screen.getByRole('option', { name: 'Pepper' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Rex' })).toBeNull()
  })

  it('treats an edited client name as a new client: Phone appears and the dog on file is dropped', async () => {
    const { user } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    expect(phone()).toBeNull()

    await user.type(owner(), 'x')

    expect(owner().value).toBe('Sarah Leex')
    expect(phone()).toBeTruthy()
    expect(dog().value).toBe('')
  })
})

describe('duplicate-client warning', () => {
  const messySarah = '  sarah   LEE '

  it('warns when a typed new name matches an existing client, ignoring case and spaces', async () => {
    const { user } = renderForm()

    await user.type(owner(), messySarah)

    expect(screen.getByText('Sarah Lee is already a client — use them?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use Sarah Lee' })).toBeTruthy()
    expect(screen.queryByText(/Pick from the list/)).toBeNull()
  })

  it('switches the request to the existing client when the button is clicked', async () => {
    const requests = captureCreate()
    const { user, onCreated } = renderForm()

    await user.type(owner(), messySarah)
    await user.click(screen.getByRole('button', { name: 'Use Sarah Lee' }))
    expect(owner().value).toBe('Sarah Lee')
    expect(screen.queryByText(/is already a client/)).toBeNull()
    expect(phone()).toBeNull()
    await pickDog(user, 'bis', 'Biscuit')
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(booking))
    expect(requests[0].client).toEqual({ id: 1 })
  })

  it('still creates a new client when submitted without using the button', async () => {
    const requests = captureCreate()
    const { user } = renderForm()

    await user.type(owner(), messySarah)
    await user.type(phone() as HTMLInputElement, '07700 900999')
    await user.type(dog(), 'Biscuit')
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].client).toEqual({ name: 'sarah   LEE', phone: '+447700900999' })
    expect(requests[0].dog).toEqual({ name: 'Biscuit' })
  })

  it('offers the first match and says to pick from the list when several clients share the name', async () => {
    const otherSarah: Client = { id: 3, name: 'Sarah  Lee', phone: null, dogs: [] }
    const { user } = renderForm([...clients, otherSarah])

    await user.type(owner(), messySarah)

    expect(screen.getByRole('button', { name: 'Use Sarah Lee' })).toBeTruthy()
    expect(screen.getByText('Pick from the list to choose between clients named Sarah Lee')).toBeTruthy()
  })
})

describe('errors from the API', () => {
  it("shows a field error under the input it names (stays[1].pickUpDate under day 2's pick-up)", async () => {
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json(
          {
            status: 400,
            title: 'Invalid request',
            errors: [{ field: 'stays[1].pickUpDate', message: 'must be at most 60 nights after dropOffDate' }],
          },
          { status: 400, headers: problemHeaders },
        ),
      ),
    )
    const { user } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    await user.click(screen.getByRole('button', { name: 'Add another day' }))
    expect(screen.getByRole('button', { name: 'Remove day 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove day 2' })).toBeTruthy()
    fillDay(0, '02/11/2030', '04/11/2030')
    fillDay(1, '10/11/2030', '12/11/2030')
    await submit(user)

    const day2 = screen.getByRole('region', { name: 'Day 2' })
    expect(await within(day2).findByText('must be at most 60 nights after dropOffDate')).toBeTruthy()
    const day1 = screen.getByRole('region', { name: 'Day 1' })
    expect(within(day1).queryByText('must be at most 60 nights after dropOffDate')).toBeNull()
  })

  it('clears an old field error when a resubmit succeeds', async () => {
    let posts = 0
    server.use(
      http.post('/api/bookings', () => {
        posts += 1
        if (posts === 1) {
          return HttpResponse.json(
            { status: 400, title: 'Invalid request', errors: [{ field: 'notes', message: 'notes are too long' }] },
            { status: 400, headers: problemHeaders },
          )
        }
        return HttpResponse.json(booking, { status: 201 })
      }),
    )
    const { user, onCreated } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)
    expect(await screen.findByText('notes are too long')).toBeTruthy()

    await submit(user)
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(booking))
    expect(screen.queryByText('notes are too long')).toBeNull()
  })

  it('lists a field error it cannot place in the banner', async () => {
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json(
          { status: 400, title: 'Invalid request', errors: [{ field: 'somethingElse', message: 'is odd' }] },
          { status: 400, headers: problemHeaders },
        ),
      ),
    )
    const { user } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    const banner = await screen.findByRole('alert')
    expect(within(banner).getByText('Invalid request')).toBeTruthy()
    expect(within(banner).getByText('somethingElse: is odd')).toBeTruthy()
  })

  it("shows a day-care day's unitRate error on the Day Rate field", async () => {
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json(
          {
            status: 400,
            title: 'Invalid request',
            errors: [{ field: 'stays[0].unitRate', message: 'must be at most 1000.00' }],
          },
          { status: 400, headers: problemHeaders },
        ),
      ),
    )
    const { user } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    fillDay(0, '02/11/2030', '02/11/2030')
    await submit(user)

    await screen.findByText('must be at most 1000.00')
    const helperOf = (label: string) => {
      const describedBy = screen.getByLabelText(label).getAttribute('aria-describedby')
      return describedBy ? document.getElementById(describedBy)?.textContent : undefined
    }
    expect(helperOf('Day Rate')).toBe('must be at most 1000.00')
    expect(helperOf('Overnight Rate')).toBeUndefined()
  })

  it('offers to switch to the client who has the phone (409), sending nothing until resubmitted', async () => {
    const requests: CreateBookingRequest[] = []
    server.use(
      http.post('/api/bookings', async ({ request }) => {
        const body = (await request.json()) as CreateBookingRequest
        requests.push(body)
        if (body.client.id === undefined) {
          return HttpResponse.json(
            {
              status: 409,
              title: 'Phone already on file',
              detail: 'This phone number already belongs to Sarah Lee. Book for that client instead.',
              existingClient: { id: 1, name: 'Sarah Lee' },
            },
            { status: 409, headers: problemHeaders },
          )
        }
        return HttpResponse.json(booking, { status: 201 })
      }),
    )
    const { user, onCreated } = renderForm()

    await user.type(owner(), 'S Lee')
    await user.type(phone() as HTMLInputElement, '07700900123')
    await user.type(dog(), 'Biscuit')
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    expect(await screen.findByText(/This number belongs to/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Use Sarah Lee' }))
    expect(owner().value).toBe('Sarah Lee')
    expect(phone()).toBeNull()
    expect(requests).toHaveLength(1)

    await submit(user)
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(booking))
    expect(requests[1].client).toEqual({ id: 1 })
    expect(requests[1].dog).toEqual({ name: 'Biscuit' })
  })

  it('keeps everything typed when the network fails', async () => {
    server.use(http.post('/api/bookings', () => HttpResponse.error()))
    const { user } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    await user.type(screen.getByLabelText('Notes'), 'Allergic to chicken')
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    expect(await screen.findByText('Could not reach the server')).toBeTruthy()
    expect(owner().value).toBe('Sarah Lee')
    expect(dog().value).toBe('Biscuit')
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Allergic to chicken')
    const dropOff = screen.getAllByLabelText('Drop-off Date', { selector: 'input' })[0] as HTMLInputElement
    expect(dropOff.value).toBe('02/11/2030')
  })
})
