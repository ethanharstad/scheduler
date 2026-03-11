import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, GripVertical } from 'lucide-react'
import type { FormFieldDefinition, FormFieldType } from '@/lib/form.types'

const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Checkbox (Yes/No)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'signature', label: 'Signature' },
  { value: 'photo', label: 'Photo' },
  { value: 'repeating_group', label: 'Repeating Group' },
  { value: 'section_header', label: 'Section Header' },
  { value: 'divider', label: 'Divider' },
]

function generateKey(label: string, existingKeys: Set<string>): string {
  let key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  if (!key) key = 'field'
  let candidate = key
  let counter = 2
  while (existingKeys.has(candidate)) {
    candidate = `${key}_${counter}`
    counter++
  }
  return candidate
}

function makeDefaultField(type: FormFieldType, existingKeys: Set<string>): FormFieldDefinition {
  const base = {
    key: generateKey(type, existingKeys),
    label: '',
    sortOrder: 0,
    required: false,
  }

  switch (type) {
    case 'text':
    case 'textarea':
      return { ...base, type }
    case 'number':
      return { ...base, type: 'number' }
    case 'boolean':
      return { ...base, type: 'boolean', trueLabel: 'Yes', falseLabel: 'No' }
    case 'select':
    case 'multi_select':
      return { ...base, type, options: [{ label: 'Option 1', value: 'option_1' }] }
    case 'date':
      return { ...base, type: 'date' }
    case 'time':
      return { ...base, type: 'time' }
    case 'signature':
      return { ...base, type: 'signature' }
    case 'photo':
      return { ...base, type: 'photo' }
    case 'repeating_group':
      return { ...base, type: 'repeating_group', children: [] }
    case 'section_header':
      return { ...base, type: 'section_header' }
    case 'divider':
      return { ...base, type: 'divider' }
  }
}

export function FieldBuilder({
  fields,
  onChange,
}: {
  fields: FormFieldDefinition[]
  onChange: (fields: FormFieldDefinition[]) => void
}) {
  const [addingType, setAddingType] = useState<FormFieldType | ''>('')

  const existingKeys = new Set(fields.map((f) => f.key))

  function addField() {
    if (!addingType) return
    const newField = makeDefaultField(addingType as FormFieldType, existingKeys)
    newField.sortOrder = fields.length
    onChange([...fields, newField])
    setAddingType('')
  }

  function updateField(index: number, updates: Partial<FormFieldDefinition>) {
    const updated = fields.map((f, i) => (i === index ? { ...f, ...updates } : f))
    onChange(updated as FormFieldDefinition[])
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index))
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= fields.length) return
    const copy = [...fields]
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
    onChange(copy)
  }

  const inputClass =
    'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <h2
        className="text-lg font-bold text-navy-700"
        style={{ fontFamily: 'var(--font-condensed)' }}
      >
        Form Fields
      </h2>

      {fields.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">
          No fields yet. Add one below.
        </p>
      )}

      <div className="space-y-3">
        {fields.map((field, i) => (
          <FieldRow
            key={`${field.key}-${i}`}
            field={field}
            index={i}
            total={fields.length}
            onUpdate={(updates) => updateField(i, updates)}
            onRemove={() => removeField(i)}
            onMove={(dir) => moveField(i, dir)}
            inputClass={inputClass}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <select
          value={addingType}
          onChange={(e) => setAddingType(e.target.value as FormFieldType | '')}
          className={`${inputClass} max-w-xs`}
        >
          <option value="">Select field type…</option>
          {FIELD_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          onClick={addField}
          disabled={!addingType}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-navy-700 border border-navy-300 rounded-lg hover:bg-navy-50 disabled:opacity-40"
        >
          <Plus className="w-4 h-4" /> Add Field
        </button>
      </div>
    </div>
  )
}

function FieldRow({
  field,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
  inputClass,
}: {
  field: FormFieldDefinition
  index: number
  total: number
  onUpdate: (updates: Partial<FormFieldDefinition>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  inputClass: string
}) {
  const isLayout = field.type === 'section_header' || field.type === 'divider'

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
      <div className="flex items-center gap-3">
        <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
        <span
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0"
          style={{ fontFamily: 'var(--font-condensed)' }}
        >
          {FIELD_TYPE_OPTIONS.find((o) => o.value === field.type)?.label}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
          title="Move up"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
          title="Move down"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-red-400 hover:text-red-600"
          title="Remove field"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {field.type === 'divider' ? null : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-0.5 block">Label</label>
            <input
              type="text"
              value={field.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder={isLayout ? 'Section title' : 'Field label'}
              className={inputClass}
            />
          </div>
          {!isLayout && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-0.5 block">Key</label>
              <input
                type="text"
                value={field.key}
                onChange={(e) =>
                  onUpdate({
                    key: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, '_'),
                  })
                }
                placeholder="field_key"
                className={inputClass}
              />
            </div>
          )}
        </div>
      )}

      {!isLayout && (
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={field.required ?? false}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="rounded border-gray-300"
            />
            Required
          </label>
        </div>
      )}

      {/* Type-specific config */}
      {field.type === 'boolean' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-0.5 block">True Label</label>
            <input
              type="text"
              value={'trueLabel' in field ? (field.trueLabel ?? '') : ''}
              onChange={(e) => onUpdate({ trueLabel: e.target.value } as Partial<FormFieldDefinition>)}
              placeholder="Pass"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-0.5 block">False Label</label>
            <input
              type="text"
              value={'falseLabel' in field ? (field.falseLabel ?? '') : ''}
              onChange={(e) => onUpdate({ falseLabel: e.target.value } as Partial<FormFieldDefinition>)}
              placeholder="Fail"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {field.type === 'number' && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-0.5 block">Min</label>
            <input
              type="number"
              value={'min' in field ? (field.min ?? '') : ''}
              onChange={(e) =>
                onUpdate({ min: e.target.value ? Number(e.target.value) : undefined } as Partial<FormFieldDefinition>)
              }
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-0.5 block">Max</label>
            <input
              type="number"
              value={'max' in field ? (field.max ?? '') : ''}
              onChange={(e) =>
                onUpdate({ max: e.target.value ? Number(e.target.value) : undefined } as Partial<FormFieldDefinition>)
              }
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-0.5 block">Unit</label>
            <input
              type="text"
              value={'unit' in field ? (field.unit ?? '') : ''}
              onChange={(e) => onUpdate({ unit: e.target.value || undefined } as Partial<FormFieldDefinition>)}
              placeholder="psi"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {(field.type === 'select' || field.type === 'multi_select') && 'options' in field && (
        <OptionsEditor
          options={field.options}
          onChange={(options) => onUpdate({ options } as Partial<FormFieldDefinition>)}
          inputClass={inputClass}
        />
      )}

      {field.type === 'repeating_group' && 'children' in field && (
        <div className="pl-4 border-l-2 border-navy-200">
          <label className="text-xs font-medium text-gray-600 mb-1 block">
            Child Fields (repeated per entry)
          </label>
          <FieldBuilder
            fields={field.children}
            onChange={(children) =>
              onUpdate({ children } as Partial<FormFieldDefinition>)
            }
          />
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-0.5 block">Min Entries</label>
              <input
                type="number"
                value={'minEntries' in field ? (field.minEntries ?? '') : ''}
                onChange={(e) =>
                  onUpdate({ minEntries: e.target.value ? Number(e.target.value) : undefined } as Partial<FormFieldDefinition>)
                }
                className={inputClass}
                min={0}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-0.5 block">Max Entries</label>
              <input
                type="number"
                value={'maxEntries' in field ? (field.maxEntries ?? '') : ''}
                onChange={(e) =>
                  onUpdate({ maxEntries: e.target.value ? Number(e.target.value) : undefined } as Partial<FormFieldDefinition>)
                }
                className={inputClass}
                min={1}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OptionsEditor({
  options,
  onChange,
  inputClass,
}: {
  options: { label: string; value: string }[]
  onChange: (opts: { label: string; value: string }[]) => void
  inputClass: string
}) {
  function addOption() {
    const n = options.length + 1
    onChange([...options, { label: `Option ${n}`, value: `option_${n}` }])
  }

  function removeOption(i: number) {
    onChange(options.filter((_, idx) => idx !== i))
  }

  function updateOption(i: number, field: 'label' | 'value', val: string) {
    const updated = options.map((o, idx) =>
      idx === i ? { ...o, [field]: val } : o,
    )
    onChange(updated)
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-600 block">Options</label>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={opt.label}
            onChange={(e) => {
              updateOption(i, 'label', e.target.value)
              updateOption(i, 'value', e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
            }}
            placeholder="Option label"
            className={`${inputClass} flex-1`}
          />
          <button
            onClick={() => removeOption(i)}
            className="p-1 text-red-400 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        onClick={addOption}
        className="text-xs text-navy-700 hover:underline font-medium"
      >
        + Add option
      </button>
    </div>
  )
}
