// ---------------------------------------------------------------------------
// Generic Forms Types (010-generic-forms)
// ---------------------------------------------------------------------------

// --- Field type discriminated union ---

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'time'
  | 'signature'
  | 'photo'
  | 'repeating_group'
  | 'section_header'
  | 'divider'

export interface FieldCondition {
  fieldKey: string
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in'
  value: string | number | boolean | string[]
}

export interface FormFieldBase {
  key: string
  type: FormFieldType
  label: string
  description?: string
  required?: boolean
  sortOrder: number
  condition?: FieldCondition
}

export interface TextFieldDef extends FormFieldBase {
  type: 'text' | 'textarea'
  minLength?: number
  maxLength?: number
  placeholder?: string
}

export interface NumberFieldDef extends FormFieldBase {
  type: 'number'
  min?: number
  max?: number
  step?: number
  unit?: string
}

export interface BooleanFieldDef extends FormFieldBase {
  type: 'boolean'
  trueLabel?: string
  falseLabel?: string
}

export interface SelectFieldDef extends FormFieldBase {
  type: 'select' | 'multi_select'
  options: { label: string; value: string }[]
}

export interface DateFieldDef extends FormFieldBase {
  type: 'date'
}

export interface TimeFieldDef extends FormFieldBase {
  type: 'time'
}

export interface SignatureFieldDef extends FormFieldBase {
  type: 'signature'
}

export interface PhotoFieldDef extends FormFieldBase {
  type: 'photo'
  maxPhotos?: number
}

export interface RepeatingGroupFieldDef extends FormFieldBase {
  type: 'repeating_group'
  minEntries?: number
  maxEntries?: number
  children: FormFieldDefinition[]
}

export interface SectionHeaderDef extends FormFieldBase {
  type: 'section_header'
}

export interface DividerDef extends FormFieldBase {
  type: 'divider'
}

export type FormFieldDefinition =
  | TextFieldDef
  | NumberFieldDef
  | BooleanFieldDef
  | SelectFieldDef
  | DateFieldDef
  | TimeFieldDef
  | SignatureFieldDef
  | PhotoFieldDef
  | RepeatingGroupFieldDef
  | SectionHeaderDef
  | DividerDef

// --- Template types ---

export type FormCategory =
  | 'equipment_inspection'
  | 'property_inspection'
  | 'medication'
  | 'custom'

export const FORM_CATEGORIES: FormCategory[] = [
  'equipment_inspection',
  'property_inspection',
  'medication',
  'custom',
]

export const FORM_CATEGORY_LABELS: Record<FormCategory, string> = {
  equipment_inspection: 'Equipment Inspection',
  property_inspection: 'Property Inspection',
  medication: 'Medication',
  custom: 'Custom',
}

export type FormTemplateStatus = 'draft' | 'published' | 'archived'

export interface FormTemplateView {
  id: string
  orgId: string | null
  name: string
  description: string | null
  category: FormCategory
  isSystem: boolean
  status: FormTemplateStatus
  currentVersionNumber: number
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

export interface FormTemplateVersionView {
  id: string
  templateId: string
  versionNumber: number
  fields: FormFieldDefinition[]
  publishedAt: string | null
  createdAt: string
}

// --- Submission types ---

export type LinkedEntityType = 'asset' | 'staff_member'

export interface FormSubmissionView {
  id: string
  templateId: string
  templateName: string
  templateVersionId: string
  versionNumber: number
  submittedById: string
  submittedByName: string
  status: 'in_progress' | 'complete'
  linkedEntityType: LinkedEntityType | null
  linkedEntityId: string | null
  linkedEntityName: string | null
  submittedAt: string
}

export interface FormResponseValueView {
  fieldKey: string
  fieldType: FormFieldType
  valueText: string | null
  valueNumber: number | null
  valueBoolean: boolean | null
}

export interface FormSubmissionDetailView extends FormSubmissionView {
  fields: FormFieldDefinition[]
  values: FormResponseValueView[]
}

// --- Server function I/O ---

export interface CreateFormTemplateInput {
  orgSlug: string
  name: string
  description?: string
  category: FormCategory
  fields: FormFieldDefinition[]
}
export type CreateFormTemplateOutput =
  | { success: true; template: FormTemplateView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' }

export interface CloneSystemTemplateInput {
  orgSlug: string
  systemTemplateId: string
  name?: string
}
export type CloneSystemTemplateOutput =
  | {
      success: true
      template: FormTemplateView
    }
  | {
      success: false
      error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_SYSTEM_TEMPLATE'
    }

export interface UpdateFormTemplateInput {
  orgSlug: string
  templateId: string
  name?: string
  description?: string
  fields?: FormFieldDefinition[]
}
export type UpdateFormTemplateOutput =
  | { success: true; template: FormTemplateView }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ARCHIVED' }

export interface PublishFormTemplateInput {
  orgSlug: string
  templateId: string
}
export type PublishFormTemplateOutput =
  | { success: true; template: FormTemplateView }
  | {
      success: false
      error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NO_FIELDS' | 'ALREADY_PUBLISHED'
    }

export interface ArchiveFormTemplateInput {
  orgSlug: string
  templateId: string
}
export type ArchiveFormTemplateOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

export interface ListFormTemplatesInput {
  orgSlug: string
  category?: FormCategory
  status?: FormTemplateStatus
  includeSystem?: boolean
}
export type ListFormTemplatesOutput =
  | { success: true; templates: FormTemplateView[] }
  | { success: false; error: 'UNAUTHORIZED' }

export interface GetFormTemplateInput {
  orgSlug: string
  templateId: string
}
export type GetFormTemplateOutput =
  | {
      success: true
      template: FormTemplateView
      currentVersion: FormTemplateVersionView
    }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

export interface SubmitFormInput {
  orgSlug: string
  templateId: string
  linkedEntityType?: LinkedEntityType
  linkedEntityId?: string
  values: Record<string, string | number | boolean | string[] | null>
}
export type SubmitFormOutput =
  | { success: true; submission: FormSubmissionView }
  | {
      success: false
      error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_PUBLISHED' | 'VALIDATION_ERROR'
      validationErrors?: Record<string, string>
    }

export interface ListSubmissionsInput {
  orgSlug: string
  templateId?: string
  linkedEntityType?: LinkedEntityType
  linkedEntityId?: string
  submittedBy?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}
export type ListSubmissionsOutput =
  | { success: true; submissions: FormSubmissionView[]; total: number }
  | { success: false; error: 'UNAUTHORIZED' }

export interface GetSubmissionInput {
  orgSlug: string
  submissionId: string
}
export type GetSubmissionOutput =
  | { success: true; submission: FormSubmissionDetailView }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }
