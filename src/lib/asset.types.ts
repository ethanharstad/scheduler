// ---------------------------------------------------------------------------
// Asset Management Types (007-asset-management)
// ---------------------------------------------------------------------------

export type AssetType = 'apparatus' | 'gear'

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual'

export interface RecurrenceRule {
  freq: RecurrenceFreq
  dayOfWeek?: number  // 0=Sun..6=Sat, used when freq='weekly'
  dayOfMonth?: number // 1-28, used when freq='monthly'|'quarterly'|'semi_annual'|'annual'
}

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
  expirationDate: string | null
  nextInspectionDue: string | null
  createdAt: string
  updatedAt: string
}

export interface AssetDetailView extends AssetView {
  notes: string | null
  manufactureDate: string | null
  purchasedDate: string | null
  inServiceDate: string | null
  warrantyExpirationDate: string | null
  inspectionIntervalDays: number | null
  inspectionRecurrenceRule: RecurrenceRule | null
  customFields: Record<string, string | number | boolean> | null
}

export interface InspectionView {
  id: string
  assetId: string
  inspectorStaffId: string
  inspectorName: string
  result: 'pass' | 'fail'
  notes: string | null
  inspectionDate: string
  createdAt: string
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

export interface LogInspectionInput {
  orgSlug: string
  assetId: string
  result: 'pass' | 'fail'
  notes?: string
  inspectionDate?: string
}
export type LogInspectionOutput =
  | { success: true; inspection: InspectionView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' }

export interface GetInspectionHistoryInput {
  orgSlug: string
  assetId: string
  limit?: number
  offset?: number
}
export type GetInspectionHistoryOutput =
  | { success: true; inspections: InspectionView[]; total: number }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export interface EditInspectionInput {
  orgSlug: string
  assetId: string
  inspectionId: string
  result: 'pass' | 'fail'
  notes: string | null
  inspectionDate: string
}
export type EditInspectionOutput =
  | { success: true; inspection: InspectionView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' }

export interface DeleteInspectionInput {
  orgSlug: string
  assetId: string
  inspectionId: string
}
export type DeleteInspectionOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

export interface SetInspectionIntervalInput {
  orgSlug: string
  assetId: string
  intervalDays: number | null
  recurrenceRule: RecurrenceRule | null
}
export type SetInspectionIntervalOutput =
  | { success: true; asset: AssetView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' }

export interface GetExpiringAssetsInput {
  orgSlug: string
  lookaheadDays?: number
}
export type GetExpiringAssetsOutput =
  | { success: true; assets: AssetView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export interface GetOverdueInspectionsInput {
  orgSlug: string
  lookaheadDays?: number
}
export type GetOverdueInspectionsOutput =
  | { success: true; assets: AssetView[] }
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
