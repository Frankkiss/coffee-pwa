import { useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createBean } from '../beans/beanService'
import { toBeanInsertPayload } from '../beans/beanForm'
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
  const [form, setForm] = useState<BeanForm | null>(null)
  const [lastResponse, setLastResponse] = useState<SourceImportResponse | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  function updateField(field: keyof BeanForm, value: string) {
    setForm((current) => (current ? { ...current, [field]: value } : current))
  }

  async function handleParse() {
    const sourceUrl = url.trim()
    setStatus('')
    setError('')
    setForm(null)
    setLastResponse(null)

    if (!sourceUrl) {
      setError('请先粘贴来源链接。')
      return
    }

    setIsParsing(true)

    try {
      const response = await requestSourceImport(supabase, sourceUrl)
      setLastResponse(response)

      if (!response.configured) {
        setError('DeepSeek API 尚未配置，暂时无法 AI 解析链接。')
        await recordSourceImport(supabase, {
          userId: session.user.id,
          sourceUrl,
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
          sourceUrl: response.sourceUrl || sourceUrl,
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
      setError(err instanceof Error ? err.message : '解析来源链接失败')
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
      setStatus('已保存到豆仓。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存导入草稿失败')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="source-import" aria-labelledby="source-import-title">
      <div>
        <p className="source-import__eyebrow">Source Import</p>
        <h3 id="source-import-title">来源导入</h3>
        <p>粘贴公开商品页或豆单链接，用 AI 生成草稿；保存前需要你确认。</p>
      </div>

      <div className="source-import__bar">
        <label>
          来源链接
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/coffee-bean"
            inputMode="url"
          />
        </label>
        <button type="button" onClick={handleParse} disabled={isParsing}>
          {isParsing ? '解析中' : '解析链接'}
        </button>
      </div>

      {form ? (
        <div className="source-import__draft">
          <div className="source-import__draft-header">
            <strong>导入预览</strong>
            {lastResponse?.rawTextLength ? (
              <span>读取文本约 {lastResponse.rawTextLength} 字符</span>
            ) : null}
          </div>

          <div className="source-import__grid">
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
              产地
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
              处理法
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
            </label>
            <label>
              品种
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
