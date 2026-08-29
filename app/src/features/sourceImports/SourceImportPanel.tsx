import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { toBeanUpdatePayload } from '../beans/beanForm'
import { PROCESS_OPTIONS, ROAST_LEVEL_OPTIONS } from '../beans/beanOptions'
import type { Bean, BeanForm } from '../beans/beanTypes'
import { useOptionalSyncRuntime } from '../sync/SyncContext'
import { createBeanFormFromSourceDraft } from './sourceImportMapping'
import { recordSourceImport, requestSourceImport } from './sourceImportService'
import type { SourceImportResponse } from './sourceImportTypes'
import { getSourceImportAvailability } from './sourceImportAvailability'
import { readSourceImportImage, validateSourceImportImage } from './sourceImportImage'
import './sourceImports.css'

type SourceImportPanelProps = {
  session: Session
  supabase: SupabaseClient
  onBeanCreated: (bean: Bean) => void
}

export function SourceImportPanel({
  session,
  supabase,
  onBeanCreated,
}: SourceImportPanelProps) {
  const runtime = useOptionalSyncRuntime()
  const beanRepository = runtime?.repositories?.beans ?? null
  const [pastedText, setPastedText] = useState('')
  const [form, setForm] = useState<BeanForm | null>(null)
  const [lastResponse, setLastResponse] = useState<SourceImportResponse | null>(null)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const parseAvailability = getSourceImportAvailability(isOnline)

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  function updateField<K extends keyof BeanForm>(field: K, value: BeanForm[K]) {
    setForm((current) => (current ? { ...current, [field]: value } : current))
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const image = event.target.files?.[0] ?? null

    if (!image) {
      setSelectedImage(null)
      setError('')
      return
    }

    const validationError = validateSourceImportImage(image)
    if (validationError) {
      setSelectedImage(null)
      event.target.value = ''
      setError(validationError)
      return
    }

    setSelectedImage(image)
    setError('')
  }

  async function handleParse() {
    if (!parseAvailability.enabled) {
      setError(parseAvailability.message)
      return
    }
    const detailText = pastedText.trim()
    setStatus('')
    setError('')
    setForm(null)
    setLastResponse(null)

    if (!detailText && !selectedImage) {
      setError('请上传一张包装图片，或粘贴商品详情文字。')
      return
    }

    setIsParsing(true)

    try {
      const image = selectedImage ? await readSourceImportImage(selectedImage) : undefined
      const response = await requestSourceImport(supabase, {
        pastedText: detailText,
        image,
      })
      setLastResponse(response)

      if (!response.configured) {
        setError('DeepSeek 视觉 API 尚未配置，暂时无法解析。')
        await recordSourceImport(supabase, {
          userId: session.user.id,
          sourceUrl: response.sourceUrl || 'manual://pasted-text',
          status: 'failed',
          extractedPayload: response,
          errorMessage: response.error ?? 'DeepSeek vision API not configured',
        }, runtime?.syncMode)
        return
      }

      if (!response.draft) {
        setError(response.error ?? '没有解析出可用的咖啡豆草稿。')
        await recordSourceImport(supabase, {
          userId: session.user.id,
          sourceUrl: response.sourceUrl || 'manual://pasted-text',
          status: 'failed',
          extractedPayload: response,
          errorMessage: response.error ?? 'No draft extracted',
        }, runtime?.syncMode)
        return
      }

      const nextForm = createBeanFormFromSourceDraft(response.draft)
      setForm(nextForm)
      setStatus('已生成草稿。请检查并修改后，再确认保存到豆仓。')
      await recordSourceImport(supabase, {
        userId: session.user.id,
        sourceUrl: response.sourceUrl,
        status: 'draft',
        extractedPayload: response,
      }, runtime?.syncMode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 解析失败')
    } finally {
      setIsParsing(false)
    }
  }

  async function handleConfirmSave() {
    if (!form) {
      return
    }

    setIsSaving(true)
    setStatus('')
    setError('')

    try {
      if (!beanRepository) throw new Error('本地豆仓仍在初始化，请稍后再试。')
      const bean = await beanRepository.createBean(toBeanUpdatePayload(form))
      onBeanCreated(bean)
      setForm(null)
      setLastResponse(null)
      setPastedText('')
      setSelectedImage(null)
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
      setStatus('已保存到豆仓，正在等待同步。')
      if (runtime) void runtime.run().catch(() => undefined)
      try {
        await recordSourceImport(supabase, {
          userId: session.user.id,
          sourceUrl: form.sourceUrl,
          status: 'saved',
          extractedPayload: lastResponse ?? {},
          selectedPayload: form,
        }, runtime?.syncMode)
      } catch {
        setStatus('豆子已安全保存；来源记录暂未写入云端。')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存导入草稿失败')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section id="source-import" className="source-import" aria-labelledby="source-import-title">
      <div>
        <p className="source-import__eyebrow">Source Import</p>
        <h3 id="source-import-title">来源导入</h3>
        <p>上传包装图片或粘贴详情文字，AI 生成待确认草稿。</p>
      </div>

      <div className="source-import__bar">
        <button type="button" onClick={handleParse} disabled={isParsing || !parseAvailability.enabled}>
          {isParsing ? '解析中' : 'AI 解析图片/文字'}
        </button>
        {parseAvailability.message ? <p role="status">{parseAvailability.message}</p> : null}
      </div>

      <div className="source-import__image">
        <label>
          图片导入
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} />
        </label>
        <p>图片仅用于本次 AI 解析，不保存原图。支持 JPEG、PNG、WebP，最大 8 MB。</p>
        {selectedImage ? <p className="source-import__image-status">已选择：{selectedImage.name}</p> : null}
      </div>

      <label>
        商品详情文字（可选）
        <textarea
          value={pastedText}
          onChange={(event) => setPastedText(event.target.value)}
          placeholder="粘贴标题、风味、产地、处理法、烘焙商等。"
          rows={5}
        />
      </label>

      {form ? (
        <div className="source-import__draft">
          <div className="source-import__draft-header">
            <strong>导入预览</strong>
            {lastResponse?.rawTextLength ? (
              <span>解析文本约 {lastResponse.rawTextLength} 字符</span>
            ) : null}
          </div>

          <div className="source-import__grid">
            <label>
              豆子类型
              <select
                value={form.beanType}
                onChange={(event) =>
                  updateField('beanType', event.target.value === 'blend' ? 'blend' : 'single_origin')
                }
              >
                <option value="single_origin">单一产区 / SOE</option>
                <option value="blend">拼配豆</option>
              </select>
            </label>

            <label>
              名称
              <input
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                required
              />
            </label>
            <label>
              烘焙商
              <input
                value={form.roaster}
                onChange={(event) => updateField('roaster', event.target.value)}
              />
            </label>
            <label>
              {form.beanType === 'blend' ? '产地（可多个）' : '产地'}
              <input
                value={form.origin}
                onChange={(event) => updateField('origin', event.target.value)}
              />
            </label>
            <label>
              庄园 / 处理站
              <input
                value={form.farmOrStation}
                onChange={(event) => updateField('farmOrStation', event.target.value)}
              />
            </label>
            <label>
              {form.beanType === 'blend' ? '处理法（可多个）' : '处理法'}
              {form.beanType === 'blend' ? (
                <input
                  value={form.process}
                  onChange={(event) => updateField('process', event.target.value)}
                  placeholder="例如：日晒 / 水洗"
                />
              ) : (
                <select
                  value={form.process}
                  onChange={(event) => updateField('process', event.target.value)}
                >
                  <option value="">未选择</option>
                  {form.process && !PROCESS_OPTIONS.includes(form.process) ? (
                    <option value={form.process}>{form.process}</option>
                  ) : null}
                  {PROCESS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label>
              {form.beanType === 'blend' ? '品种（可多个）' : '品种'}
              <input
                value={form.variety}
                onChange={(event) => updateField('variety', event.target.value)}
              />
            </label>
            <label>
              海拔
              <input
                inputMode="numeric"
                value={form.altitudeMeters}
                onChange={(event) => updateField('altitudeMeters', event.target.value)}
              />
            </label>
            <label>
              烘焙日期
              <input
                type="date"
                value={form.roastDate}
                onChange={(event) => updateField('roastDate', event.target.value)}
              />
            </label>
            <label>
              烘焙度
              <select
                value={form.roastLevel}
                onChange={(event) => updateField('roastLevel', event.target.value)}
              >
                <option value="">未选择</option>
                {form.roastLevel && !ROAST_LEVEL_OPTIONS.includes(form.roastLevel) ? (
                  <option value={form.roastLevel}>{form.roastLevel}</option>
                ) : null}
                {ROAST_LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              风味标签
              <input
                value={form.flavorTags}
                onChange={(event) => updateField('flavorTags', event.target.value)}
              />
            </label>
          </div>

          <label>
            风味描述
            <textarea
              value={form.flavorNotes}
              onChange={(event) => updateField('flavorNotes', event.target.value)}
              rows={2}
            />
          </label>

          <label>
            备注
            <textarea
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              rows={3}
            />
          </label>

          {lastResponse?.draft?.missingFields.length ? (
            <p className="source-import__hint">
              建议补充：{lastResponse.draft.missingFields.join('、')}
            </p>
          ) : null}

          <button type="button" onClick={handleConfirmSave} disabled={isSaving}>
            {isSaving ? '保存中' : '确认保存到豆仓'}
          </button>
        </div>
      ) : null}

      {status ? <p className="source-import__status">{status}</p> : null}
      {error ? <p className="source-import__error">{error}</p> : null}
    </section>
  )
}
