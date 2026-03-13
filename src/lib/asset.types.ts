// ---------------------------------------------------------------------------
// Asset Management Types (007-asset-management)
// ---------------------------------------------------------------------------

export type AssetType = 'apparatus' | 'gear'

export type ApparatusCategory =
  | 'engine'
  | 'ladder_truck'
  | 'ambulance_medic'
  | 'battalion_chief'
  | 'rescue'
  | 'brush_wildland'
  | 'tanker_tender'
  | 'boat'
  | 'atv_utv'
  | 'command_vehicle'
  | 'utility'
  | 'other'

export type GearCategory =
  | 'scba'
  | 'ppe'
  | 'radio'
  | 'medical_equipment'
  | 'tools'
  | 'hose'
  | 'nozzle'
  | 'thermal_camera'
  | 'gas_detector'
  | 'lighting'
  | 'extrication'
  | 'rope_rescue'
  | 'water_rescue'
  | 'hazmat'
  | 'other'

export type ApparatusStatus = 'in_service' | 'out_of_service' | 'reserve' | 'decommissioned'

export type GearStatus = 'available' | 'assigned' | 'out_of_service' | 'decommissioned' | 'expired'

export const APPARATUS_CATEGORIES: ApparatusCategory[] = [
  'engine',
  'ladder_truck',
  'ambulance_medic',
  'battalion_chief',
  'rescue',
  'brush_wildland',
  'tanker_tender',
  'boat',
  'atv_utv',
  'command_vehicle',
  'utility',
  'other',
]

export const GEAR_CATEGORIES: GearCategory[] = [
  'scba',
  'ppe',
  'radio',
  'medical_equipment',
  'tools',
  'hose',
  'nozzle',
  'thermal_camera',
  'gas_detector',
  'lighting',
  'extrication',
  'rope_rescue',
  'water_rescue',
  'hazmat',
  'other',
]

export const APPARATUS_STATUSES: ApparatusStatus[] = [
  'in_service',
  'out_of_service',
  'reserve',
  'decommissioned',
]

export const GEAR_STATUSES: GearStatus[] = [
  'available',
  'assigned',
  'out_of_service',
  'decommissioned',
  'expired',
]

// ---------------------------------------------------------------------------
// Asset Location types
// ---------------------------------------------------------------------------

export interface AssetLocationView {
  id: string
  assetId: string
  name: string
  description: string | null
  sortOrder: number
}

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export interface AssetView {
  id: string
  orgId: string
  assetType: AssetType
  name: string
  category: string
  status: string
  serialNumber: string | null
  make: string | null
  model: string | null
  unitNumber: string | null
  assignedToStaffId: string | null
  assignedToStaffName: string | null
  assignedToApparatusId: string | null
  assignedToApparatusName: string | null
  assignedToLocationId: string | null
  assignedToLocationName: string | null
  expirationDate: string | null
  createdAt: string
  updatedAt: string
}

export interface AssetDetailView extends AssetView {
  notes: string | null
  manufactureDate: string | null
  purchasedDate: string | null
  inServiceDate: string | null
  warrantyExpirationDate: string | null
  customFields: Record<string, string | number | boolean> | null
}

export interface InspectionScheduleView {
  id: string
  assetId: string
  formTemplateId: string
  formTemplateName: string
  label: string
  recurrenceRule: string  // RRULE string e.g. "FREQ=WEEKLY;INTERVAL=1;BYDAY=FR"
  intervalDays: number
  nextInspectionDue: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AssetAuditEntry {
  id: string
  actorStaffId: string
  actorName: string | null
  action: string
  assetId: string
  detailJson: Record<string, string | number | boolean | null | object> | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Server function I/O types
// ---------------------------------------------------------------------------

export interface CreateAssetInput {
  orgSlug: string
  assetType: AssetType
  name: string
  category: string
  status?: string
  serialNumber?: string
  make?: string
  model?: string
  notes?: string
  manufactureDate?: string
  purchasedDate?: string
  inServiceDate?: string
  expirationDate?: string
  warrantyExpirationDate?: string
  customFields?: Record<string, string | number | boolean>
  unitNumber?: string
}
export type CreateAssetOutput =
  | { success: true; asset: AssetView }
  | {
      success: false
      error:
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'DUPLICATE_UNIT_NUMBER'
        | 'DUPLICATE_SERIAL_NUMBER'
        | 'INVALID_CATEGORY'
        | 'INVALID_INPUT'
    }

export interface UpdateAssetInput {
  orgSlug: string
  assetId: string
  name?: string
  category?: string
  serialNumber?: string | null
  make?: string | null
  model?: string | null
  notes?: string | null
  manufactureDate?: string | null
  purchasedDate?: string | null
  inServiceDate?: string | null
  expirationDate?: string | null
  warrantyExpirationDate?: string | null
  customFields?: Record<string, string | number | boolean> | null
  unitNumber?: string
}
export type UpdateAssetOutput =
  | { success: true; asset: AssetView }
  | {
      success: false
      error:
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'NOT_FOUND'
        | 'DUPLICATE_UNIT_NUMBER'
        | 'DUPLICATE_SERIAL_NUMBER'
        | 'INVALID_CATEGORY'
        | 'DECOMMISSIONED'
        | 'INVALID_INPUT'
    }

export interface GetAssetInput {
  orgSlug: string
  assetId: string
}
export type GetAssetOutput =
  | { success: true; asset: AssetDetailView }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export interface ListAssetsInput {
  orgSlug: string
  assetType?: AssetType
  status?: string
  category?: string
  assignedToStaffId?: string
  assignedToApparatusId?: string
  search?: string
  limit?: number
  offset?: number
}
export type ListAssetsOutput =
  | { success: true; assets: AssetView[]; total: number }
  | { success: false; error: 'UNAUTHORIZED' }

export interface ChangeAssetStatusInput {
  orgSlug: string
  assetId: string
  newStatus: string
}
export type ChangeAssetStatusOutput =
  | { success: true; asset: AssetView }
  | {
      success: false
      error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_STATUS' | 'DECOMMISSIONED'
    }

export interface AssignGearInput {
  orgSlug: string
  assetId: string
  assignToStaffId?: string
  assignToApparatusId?: string
  assignToLocationId?: string
}
export type AssignGearOutput =
  | { success: true; asset: AssetView }
  | {
      success: false
      error:
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'NOT_FOUND'
        | 'NOT_GEAR'
        | 'DECOMMISSIONED'
        | 'EXPIRED'
        | 'INVALID_TARGET'
        | 'INVALID_INPUT'
    }

export interface UnassignGearInput {
  orgSlug: string
  assetId: string
}
export type UnassignGearOutput =
  | { success: true; asset: AssetView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_ASSIGNED' }

export interface AddInspectionScheduleInput {
  orgSlug: string
  assetId: string
  formTemplateId: string
  label: string
  recurrenceRule: string  // RRULE string
}
export type AddInspectionScheduleOutput =
  | { success: true; schedule: InspectionScheduleView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'TEMPLATE_NOT_FOUND' | 'TEMPLATE_NOT_PUBLISHED' | 'INVALID_INPUT' | 'INVALID_RECURRENCE_RULE' }

export interface UpdateInspectionScheduleInput {
  orgSlug: string
  assetId: string
  scheduleId: string
  label?: string
  formTemplateId?: string
  recurrenceRule?: string  // RRULE string
  isActive?: boolean
}
export type UpdateInspectionScheduleOutput =
  | { success: true; schedule: InspectionScheduleView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'TEMPLATE_NOT_FOUND' | 'TEMPLATE_NOT_PUBLISHED' | 'INVALID_INPUT' | 'INVALID_RECURRENCE_RULE' }

export interface DeleteInspectionScheduleInput {
  orgSlug: string
  assetId: string
  scheduleId: string
}
export type DeleteInspectionScheduleOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

export interface GetInspectionSchedulesInput {
  orgSlug: string
  assetId: string
}
export type GetInspectionSchedulesOutput =
  | { success: true; schedules: InspectionScheduleView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export interface GetExpiringAssetsInput {
  orgSlug: string
  lookaheadDays?: number
}
export type GetExpiringAssetsOutput =
  | { success: true; assets: AssetView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export interface OverdueInspectionView {
  schedule: InspectionScheduleView
  assetName: string
  assetId: string
  assetType: AssetType
}

export interface GetOverdueInspectionsInput {
  orgSlug: string
  lookaheadDays?: number
}
export type GetOverdueInspectionsOutput =
  | { success: true; overdueInspections: OverdueInspectionView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export interface GetMyGearInput {
  orgSlug: string
}
export type GetMyGearOutput =
  | { success: true; assets: AssetView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NO_STAFF_RECORD' }

export interface GetApparatusGearInput {
  orgSlug: string
  apparatusId: string
}
export type GetApparatusGearOutput =
  | { success: true; assets: AssetView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export interface GetAssetAuditLogInput {
  orgSlug: string
  assetId: string
  limit?: number
  offset?: number
}
export type GetAssetAuditLogOutput =
  | { success: true; entries: AssetAuditEntry[]; total: number }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

// ---------------------------------------------------------------------------
// Asset Location CRUD I/O types
// ---------------------------------------------------------------------------

export interface CreateAssetLocationInput {
  orgSlug: string
  assetId: string
  name: string
  description?: string
  sortOrder?: number
}
export type CreateAssetLocationOutput =
  | { success: true; location: AssetLocationView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'DUPLICATE_NAME' }

export interface UpdateAssetLocationInput {
  orgSlug: string
  assetId: string
  locationId: string
  name?: string
  description?: string | null
  sortOrder?: number
}
export type UpdateAssetLocationOutput =
  | { success: true; location: AssetLocationView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'DUPLICATE_NAME' }

export interface DeleteAssetLocationInput {
  orgSlug: string
  assetId: string
  locationId: string
}
export type DeleteAssetLocationOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

export interface ListAssetLocationsInput {
  orgSlug: string
  assetId: string
}
export type ListAssetLocationsOutput =
  | { success: true; locations: AssetLocationView[] }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }
