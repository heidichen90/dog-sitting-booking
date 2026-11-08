import { useMemo, useRef, useState } from 'react'
import { Box, Button, Checkbox, ListItemText, Menu, MenuItem, Stack, TextField } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import DownloadIcon from '@mui/icons-material/Download'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import { AgGridReact } from 'ag-grid-react'
import {
  ClientSideRowModelModule,
  ColumnApiModule,
  CsvExportModule,
  DateFilterModule,
  ModuleRegistry,
  NumberFilterModule,
  QuickFilterModule,
  TextFilterModule,
  themeQuartz,
} from 'ag-grid-community'
import NoBookings from './NoBookings.tsx'
import { COLUMNS, DEFAULT_COL_DEF, csvFileName, toStayRows, type StayRow } from '../dashboard.ts'
import { downloadFile } from '../utils.ts'
import type { Booking } from '../types'

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ColumnApiModule,
  CsvExportModule,
  DateFilterModule,
  NumberFilterModule,
  QuickFilterModule,
  TextFilterModule,
])

interface DashboardProps {
  bookings: Booking[]
}

export default function Dashboard({ bookings }: DashboardProps) {
  const grid = useRef<AgGridReact<StayRow>>(null)
  const muiTheme = useTheme()
  const [search, setSearch] = useState('')
  const [hidden, setHidden] = useState<string[]>([])
  const [columnsMenu, setColumnsMenu] = useState<HTMLElement | null>(null)

  const rows = useMemo(() => toStayRows(bookings), [bookings])
  const theme = useMemo(
    () =>
      themeQuartz.withParams({
        accentColor: muiTheme.palette.primary.main,
        fontFamily: muiTheme.typography.fontFamily,
      }),
    [muiTheme],
  )

  if (!bookings.length) return <NoBookings />

  function toggleColumn(field: string) {
    const show = hidden.includes(field)
    grid.current?.api.setColumnsVisible([field], show)
    setHidden(show ? hidden.filter((f) => f !== field) : [...hidden, field])
  }

  function exportCsv() {
    const csv = grid.current?.api.getDataAsCsv()
    // The byte-order mark makes Excel read the file as UTF-8.
    if (csv) downloadFile(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), csvFileName())
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          label="Search"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flexGrow: 1, bgcolor: 'background.paper' }}
        />
        <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={(e) => setColumnsMenu(e.currentTarget)}>
          Columns
        </Button>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={exportCsv}>
          Export CSV
        </Button>
      </Stack>

      <Menu anchorEl={columnsMenu} open={columnsMenu !== null} onClose={() => setColumnsMenu(null)}>
        {COLUMNS.map(({ field, headerName }) =>
          field ? (
            <MenuItem key={field} dense onClick={() => toggleColumn(field)}>
              <Checkbox size="small" checked={!hidden.includes(field)} tabIndex={-1} disableRipple />
              <ListItemText primary={headerName} />
            </MenuItem>
          ) : null,
        )}
      </Menu>

      <Box sx={{ height: '70vh' }}>
        <AgGridReact<StayRow>
          ref={grid}
          theme={theme}
          rowData={rows}
          columnDefs={COLUMNS}
          defaultColDef={DEFAULT_COL_DEF}
          suppressDragLeaveHidesColumns
          getRowId={({ data }) => String(data.stayId)}
          quickFilterText={search}
        />
      </Box>
    </Stack>
  )
}
