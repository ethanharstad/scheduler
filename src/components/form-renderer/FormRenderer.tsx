import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { FormFieldDefinition } from '@/lib/form.types'

export type FormValue = string | number | boolean | string[] | null
export type FormValues = Record<string, FormValue>
export type FormErrors = Record<string, string>

export function FormRenderer({
  fields,
  values,
  errors,
  onChange,
  prefix = '',
}: {
  fields: FormFieldDefinition[]
  values: FormValues
  errors: FormErrors
  onChange: (key: string, val: FormValue) => void
  prefix?: string
}) {
  function isVisible(field: FormFieldDefinition): boolean {
    if (!field.condition) return true
    const depVal = values[`${prefix}${field.condition.fieldKey}`]
    const { operator, value: expected } = field.condition
    switch (operator) {
      case 'eq':
        return depVal === expected
      case 'neq':
        return depVal !== expected
      case 'gt':
        return typeof depVal === 'number' && typeof expected === 'number' && depVal > expected
      case 'lt':
        return typeof depVal === 'number' && typeof expected === 'number' && depVal < expected
      case 'in':
        return Array.isArray(expected) && expected.includes(String(depVal))
      default:
        return true
    }
  }

  const inputClass =
    'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent'

  return (
    <div className="space-y-5">
      {fields.filter(isVisible).map((field) => {
        const key = `${prefix}${field.key}`
        const err = errors[key]

        if (field.type === 'divider') {
          return <hr key={key} className="border-gray-200" />
        }

        if (field.type === 'section_header') {
          return (
            <h3
              key={key}
              className="text-base font-bold text-navy-700 pt-2"
              style={{ fontFamily: 'var(--font-condensed)' }}
            >
              {field.label}
            </h3>
          )
        }

        if (field.type === 'repeating_group' && 'children' in field) {
          return (
            <RepeatingGroupField
              key={key}
              field={field}
              prefix={prefix}
              values={values}
              errors={errors}
              onChange={onChange}
            />
          )
        }

        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
              {field.required && <span className="text-red-600"> *</span>}
            </label>
            {field.description && (
              <p className="text-xs text-gray-400 mb-1">{field.description}</p>
            )}
            <FieldInput
              field={field}
              value={values[key]}
              onChange={(val) => onChange(key, val)}
              inputClass={inputClass}
              hasError={!!err}
            />
            {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
          </div>
        )
      })}
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
  inputClass,
  hasError,
}: {
  field: FormFieldDefinition
  value: FormValue | undefined
  onChange: (val: FormValue) => void
  inputClass: string
  hasError: boolean
}) {
  const errBorder = hasError ? 'border-red-400' : 'border-gray-300'
  const cls = inputClass.replace('border-gray-300', errBorder)

  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'placeholder' in field ? field.placeholder : ''}
          className={cls}
        />
      )

    case 'textarea':
      return (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={'placeholder' in field ? field.placeholder : ''}
          className={cls}
        />
      )

    case 'number':
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            min={'min' in field ? field.min : undefined}
            max={'max' in field ? field.max : undefined}
            step={'step' in field ? field.step : undefined}
            className={cls}
          />
          {'unit' in field && field.unit && (
            <span className="text-sm text-gray-500 shrink-0">{field.unit}</span>
          )}
        </div>
      )

    case 'boolean': {
      const checked = value === true || value === 1
      const trueLabel = 'trueLabel' in field && field.trueLabel ? field.trueLabel : 'Yes'
      const falseLabel = 'falseLabel' in field && field.falseLabel ? field.falseLabel : 'No'
      return (
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name={field.key}
              checked={checked}
              onChange={() => onChange(true)}
              className="accent-navy-700"
            />
            {trueLabel}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name={field.key}
              checked={value === false || value === 0}
              onChange={() => onChange(false)}
              className="accent-navy-700"
            />
            {falseLabel}
          </label>
        </div>
      )
    }

    case 'select':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        >
          <option value="">Select…</option>
          {'options' in field &&
            field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
        </select>
      )

    case 'multi_select': {
      const selected: string[] = Array.isArray(value) ? value : []
      return (
        <div className="space-y-1">
          {'options' in field &&
            field.options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, opt.value]
                      : selected.filter((v) => v !== opt.value)
                    onChange(next)
                  }}
                  className="rounded border-gray-300"
                />
                {opt.label}
              </label>
            ))}
        </div>
      )
    }

    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )

    case 'time':
      return (
        <input
          type="time"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )

    case 'signature':
      return (
        <p className="text-sm text-gray-400 italic">
          Signature capture coming soon.
        </p>
      )

    case 'photo':
      return (
        <p className="text-sm text-gray-400 italic">
          Photo upload coming soon.
        </p>
      )

    default:
      return null
  }
}

function RepeatingGroupField({
  field,
  prefix,
  values,
  errors,
  onChange,
}: {
  field: FormFieldDefinition & { type: 'repeating_group'; children: FormFieldDefinition[] }
  prefix: string
  values: FormValues
  errors: FormErrors
  onChange: (key: string, val: FormValue) => void
}) {
  const groupPrefix = `${prefix}${field.key}[`
  const maxIdx = Object.keys(values)
    .filter((k) => k.startsWith(groupPrefix))
    .map((k) => {
      const match = k.match(/\[(\d+)\]/)
      return match ? parseInt(match[1], 10) : -1
    })
    .reduce((max, n) => Math.max(max, n), -1)

  const [entryCount, setEntryCount] = useState(Math.max(maxIdx + 1, field.minEntries ?? 0))

  function addEntry() {
    if (field.maxEntries && entryCount >= field.maxEntries) return
    setEntryCount((c) => c + 1)
  }

  function removeEntry(idx: number) {
    if (field.minEntries && entryCount <= field.minEntries) return
    const newValues = { ...values }
    for (let i = idx; i < entryCount - 1; i++) {
      for (const child of field.children) {
        const from = `${prefix}${field.key}[${i + 1}].${child.key}`
        const to = `${prefix}${field.key}[${i}].${child.key}`
        newValues[to] = newValues[from] ?? null
      }
    }
    for (const child of field.children) {
      const lastKey = `${prefix}${field.key}[${entryCount - 1}].${child.key}`
      delete newValues[lastKey]
    }
    for (const [k, v] of Object.entries(newValues)) {
      if (k.startsWith(groupPrefix)) {
        onChange(k, v)
      }
    }
    setEntryCount((c) => c - 1)
  }

  const err = errors[`${prefix}${field.key}`]

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {field.label}
        {field.required && <span className="text-red-600"> *</span>}
      </label>
      {field.description && (
        <p className="text-xs text-gray-400 mb-2">{field.description}</p>
      )}
      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}

      <div className="space-y-4">
        {Array.from({ length: entryCount }, (_, i) => (
          <div
            key={i}
            className="border border-gray-200 rounded-lg p-4 bg-gray-50 relative"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase" style={{ fontFamily: 'var(--font-condensed)' }}>
                Entry {i + 1}
              </span>
              {(!field.minEntries || entryCount > field.minEntries) && (
                <button
                  onClick={() => removeEntry(i)}
                  className="p-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <FormRenderer
              fields={field.children}
              values={values}
              errors={errors}
              onChange={onChange}
              prefix={`${prefix}${field.key}[${i}].`}
            />
          </div>
        ))}
      </div>

      {(!field.maxEntries || entryCount < field.maxEntries) && (
        <button
          onClick={addEntry}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900"
        >
          <Plus className="w-4 h-4" /> Add entry
        </button>
      )}
    </div>
  )
}
