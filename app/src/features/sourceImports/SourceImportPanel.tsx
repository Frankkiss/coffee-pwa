import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createBean } from '../beans/beanService'
import { toBeanInsertPayload } from '../beans/beanForm'
import { BlendComponentEditor } from '../beans/BlendComponentEditor'
import type { Bean, BeanForm } from '../beans/beanTypes'
import { createBeanFormFromSourceDraft } from './sourceImportMapping'
import { recordSourceImport, requestSourceImport } from './sourceImportService'
import type { SourceImportResponse } from './sourceImportTypes'
import './sourceImports.css'

type SourceImportPanelProps = {
  session: Session
  supabase: SupabaseClient
  onBeanCreated: (bean: Bean) => void
}

const processOptions = ['水洗', '日晒', '蜜处理', '厌氧', '特殊处理']
const roastOptions = ['浅烘', '中浅烘', '中烘', '中深烘', '深烘']

export function SourceImportPanel({
  session,
  supabase,
  onBeanCreated,
}: SourceImportPanelProps) {
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [form, setForm] = useState<BeanForm | null>(null)
  const [lastResponse, setLastResponse] = useState<SourceImportResponse | null>(null)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [isReadingImage, setIsReadingImage] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  function updateField<K extends keyof BeanForm>(field: K, value: BeanForm[K]) {
    setForm((current) => (current ? { ...current, [field]: value } : current))
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const image = event.target.files?.[0] ?? null
    setSelectedImage(image)
    setOcrStatus(image ? `已选择：${image.name}` : '')
    setError('')
  }

  async function handleRecognizeImage() {
    if (!selectedImage) {
      setError('请先选择一张商品详情图或截图。')
      return
    }

    setIsReadingImage(true)
    setOcrStatus('正在识别图片文字，手机上可能需要几十秒。')
    setError('')

    try {
      const { appendOcrText, recognizeCoffeeImageText } = await import('./imageOcr')
      const recognizedText = await recognizeCoffeeImageText(selectedImage)

      if (!recognizedText) {
        setOcrStatus('')
        setError('没有识别到可用文字。请换一张更清晰的图，或手动粘贴商品详情文字。')
        return
      }

      setPastedText((current) => appendOcrText(current, recognizedText))
      setOcrStatus(`已识别约 ${recognizedText.length} 个字符，原图不会保存。`)
    } catch (err) {
      setOcrStatus('')
      setError(err instanceof Error ? err.message : '图片文字识别失败')
    } finally {
      setIsReadingImage(false)
    }
  }

  async function handleParse() {
    const sourceUrl = url.trim()
    const detailText = pastedText.trim()
    setStatus('')
    setError('')
    setForm(null)
    setLastResponse(null)

    if (!sourceUrl && !detailText) {
      setError('请粘贴链接或商品详情文本。')
      return
    }

    setIsParsing(true)

    try {
      const response = await requestSourceImport(supabase, {
        url: sourceUrl,
        pastedText: detailText,
      })
      setLastResponse(response)

      if (!response.configured) {
        setError('DeepSeek API 尚未配置，暂时无法 AI 解析。')
        await recordSourceImport(supabase, {
          userId: session.user.id,
          sourceUrl: response.sourceUrl || sourceUrl || 'manual://pasted-text',
          status: 'failed',
          extractedPayload: response,
          errorMessage: response.error ?? 'DeepSeek API not configured',
        })
        return
      }

      if (!response.draft) {
        setError(response.error ?? '没有解析出可用的咖啡豆草稿。')
        await recordSourceImport(supabase, {
          userId: session.user.id,
          sourceUrl: response.sourceUrl || sourceUrl || 'manual://pasted-text',
          status: 'failed',
          extractedPayload: response,
          errorMessage: response.error ?? 'No draft extracted',
        })
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
      })
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
      const bean = await createBean(supabase, toBeanInsertPayload(form, session.user.id))
      onBeanCreated(bean)
      await recordSourceImport(supabase, {
        userId: session.user.id,
        sourceUrl: form.sourceUrl,
        status: 'saved',
        extractedPayload: lastResponse ?? {},
        selectedPayload: form,
      })
      setForm(null)
      setLastResponse(null)
      setUrl('')
      setPastedText('')
      setSelectedImage(null)
      setOcrStatus('')
      setStatus('已保存到豆仓。')
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
        <p>粘贴链接或详情文本。</p>
      </div>

      <div className="source-import__bar">
        <label>
          来源链接
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="可选，商品页或烘焙商页面"
            inputMode="url"
          />
        </label>
        <button type="button" onClick={handleParse} disabled={isParsing}>
          {isParsing ? '解析中' : 'AI 解析'}
        </button>
      </div>

      <div className="source-import__image">
        <label>
          图片导入
          <input type="file" accept="image/*" onChange={handleImageChange} />
        </label>
        <button type="button" onClick={handleRecognizeImage} disabled={isReadingImage}>
          {isReadingImage ? '识别中' : '识别图片文字'}
        </button>
        <p>本机识别，不保存原图。</p>
        {ocrStatus ? <p className="source-import__ocr-status">{ocrStatus}</p> : null}
      </div>

      <label>
        商品详情文本
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
                  {form.process && !processOptions.includes(form.process) ? (
                    <option value={form.process}>{form.process}</option>
                  ) : null}
                  {processOptions.map((option) => (
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
                {form.roastLevel && !roastOptions.includes(form.roastLevel) ? (
                  <option value={form.roastLevel}>{form.roastLevel}</option>
                ) : null}
                {roastOptions.map((option) => (
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
            <label>
              净含量
              <input
                inputMode="decimal"
                value={form.netWeightGrams}
                onChange={(event) => updateField('netWeightGrams', event.target.value)}
              />
            </label>
            <label>
              来源网址
              <input
                value={form.sourceUrl}
                onChange={(event) => updateField('sourceUrl', event.target.value)}
              />
            </label>
          </div>

          {form.beanType === 'blend' ? (
            <>
              <BlendComponentEditor
                components={form.blendComponents}
                onChange={(components) => updateField('blendComponents', components)}
              />
              <label>
                拼配说明
                <textarea
                  value={form.blendNotes}
                  onChange={(event) => updateField('blendNotes', event.target.value)}
                  placeholder="例如：整体坚果、奶油、柑橘调，适合冰手冲或奶咖。"
                  rows={3}
                />
              </label>
            </>
          ) : null}

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
