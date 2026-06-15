import type { BeanBlendComponent } from './beanTypes'

type BlendComponentEditorProps = {
  components: BeanBlendComponent[]
  onChange: (components: BeanBlendComponent[]) => void
}

const emptyComponent: BeanBlendComponent = {
  origin: '',
  process: '',
  variety: '',
  percentage: null,
  role: '',
  notes: '',
}

export function BlendComponentEditor({ components, onChange }: BlendComponentEditorProps) {
  const editableComponents = components.length > 0 ? components : [{ ...emptyComponent }]

  function updateComponent(
    index: number,
    field: keyof BeanBlendComponent,
    value: string,
  ) {
    const nextComponents = editableComponents.map((component, componentIndex) => {
      if (componentIndex !== index) {
        return component
      }

      return {
        ...component,
        [field]: field === 'percentage' ? parsePercentage(value) : value,
      }
    })

    onChange(nextComponents)
  }

  function addComponent() {
    onChange([...editableComponents, { ...emptyComponent }])
  }

  function removeComponent(index: number) {
    const nextComponents = editableComponents.filter((_, componentIndex) => componentIndex !== index)
    onChange(nextComponents.length > 0 ? nextComponents : [{ ...emptyComponent }])
  }

  return (
    <section className="blend-editor" aria-labelledby="blend-editor-title">
      <div className="blend-editor__header">
        <div>
          <h3 id="blend-editor-title">拼配组成</h3>
          <p>不知道比例可以留空，只记录由哪几支豆组成也可以。</p>
        </div>
        <button type="button" onClick={addComponent}>
          添加一支
        </button>
      </div>

      <div className="blend-editor__list">
        {editableComponents.map((component, index) => (
          <article className="blend-editor__card" key={index}>
            <div className="blend-editor__card-title">
              <strong>组成 {index + 1}</strong>
              {editableComponents.length > 1 ? (
                <button type="button" onClick={() => removeComponent(index)}>
                  移除
                </button>
              ) : null}
            </div>

            <div className="blend-editor__grid">
              <label>
                产地
                <input
                  value={component.origin}
                  onChange={(event) => updateComponent(index, 'origin', event.target.value)}
                  placeholder="例如：巴西"
                />
              </label>
              <label>
                处理法
                <input
                  value={component.process}
                  onChange={(event) => updateComponent(index, 'process', event.target.value)}
                  placeholder="例如：日晒"
                />
              </label>
              <label>
                品种
                <input
                  value={component.variety}
                  onChange={(event) => updateComponent(index, 'variety', event.target.value)}
                  placeholder="例如：黄波旁"
                />
              </label>
              <label>
                占比
                <input
                  inputMode="decimal"
                  value={component.percentage ?? ''}
                  onChange={(event) => updateComponent(index, 'percentage', event.target.value)}
                  placeholder="可留空"
                />
              </label>
            </div>

            <label>
              作用
              <input
                value={component.role}
                onChange={(event) => updateComponent(index, 'role', event.target.value)}
                placeholder="例如：主体甜感、香气、厚度"
              />
            </label>

            <label>
              备注
              <textarea
                value={component.notes}
                onChange={(event) => updateComponent(index, 'notes', event.target.value)}
                placeholder="例如：坚果和巧克力，或花香和柑橘"
                rows={2}
              />
            </label>
          </article>
        ))}
      </div>
    </section>
  )
}

function parsePercentage(value: string) {
  const trimmed = value.trim().replace(/%$/, '')

  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
