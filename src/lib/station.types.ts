export type StationStatus = 'active' | 'inactive'

/** Client-facing shape for the station table */
export interface StationView {
  id: string
  name: string
  code: string | null
  address: string | null
  status: StationStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Server function I/O types
// ---------------------------------------------------------------------------

export type ListStationsInput = { orgSlug: string }
export type ListStationsOutput =
  | { success: true; stations: StationView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export type CreateStationInput = {
  orgSlug: string
  name: string
  code?: string
  address?: string
}
export type CreateStationOutput =
  | { success: true; station: StationView }
  | {
      success: false
      error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'DUPLICATE_NAME' | 'DUPLICATE_CODE'
      message?: string
    }

export type UpdateStationInput = {
  orgSlug: string
  stationId: string
  name?: string
  code?: string | null
  address?: string | null
  status?: StationStatus
  sortOrder?: number
}
export type UpdateStationOutput =
  | { success: true; station: StationView }
  | {
      success: false
      error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'DUPLICATE_NAME' | 'DUPLICATE_CODE'
      message?: string
    }

export type DeleteStationInput = {
  orgSlug: string
  stationId: string
}
export type DeleteStationOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'HAS_ASSIGNMENTS' }
