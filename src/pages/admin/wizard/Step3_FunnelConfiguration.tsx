import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { QualificationStage } from '@/hooks/useAgentWizard'
import type { useAgentWizard } from '@/hooks/useAgentWizard'
import { Trash2, ChevronUp, ChevronDown, Plus, X } from 'lucide-react'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

const EMPTY_STAGE: QualificationStage = {
  stage_name: '',
  stage_key: '',
  question: '',
  subquestions: [],
  disqualification_triggers: [],
  advance_to_stage_id: '',
  advance_condition: '',
  response_options: [],
}

export default function Step3_FunnelConfiguration({ wizard }: WizardProps) {
  const stages = (wizard.wizardData.step3?.stages || []) as QualificationStage[]

  const handleUpdateStage = (index: number, updates: Partial<QualificationStage>) => {
    const newStages = [...stages]
    newStages[index] = { ...newStages[index], ...updates }
    wizard.updateStep('step3', { stages: newStages })
  }

  const handleAddStage = () => {
    const newStages = [...stages, EMPTY_STAGE]
    wizard.updateStep('step3', { stages: newStages })
  }

  const handleDeleteStage = (index: number) => {
    const newStages = stages.filter((_, i) => i !== index)
    wizard.updateStep('step3', { stages: newStages })
  }

  const handleReorderStage = (index: number, direction: 'up' | 'down') => {
    const newStages = [...stages]
    if (direction === 'up' && index > 0) {
      [newStages[index], newStages[index - 1]] = [newStages[index - 1], newStages[index]]
    } else if (direction === 'down' && index < newStages.length - 1) {
      [newStages[index], newStages[index + 1]] = [newStages[index + 1], newStages[index]]
    }
    wizard.updateStep('step3', { stages: newStages })
  }

  const handleAddSubquestion = (stageIdx: number) => {
    const stage = stages[stageIdx]
    const newSubquestions = [...(stage.subquestions || []), '']
    handleUpdateStage(stageIdx, { subquestions: newSubquestions })
  }

  const handleUpdateSubquestion = (
    stageIdx: number,
    subIdx: number,
    value: string
  ) => {
    const stage = stages[stageIdx]
    const newSubquestions = [...(stage.subquestions || [])]
    newSubquestions[subIdx] = value
    handleUpdateStage(stageIdx, { subquestions: newSubquestions })
  }

  const handleRemoveSubquestion = (stageIdx: number, subIdx: number) => {
    const stage = stages[stageIdx]
    const newSubquestions = (stage.subquestions || []).filter((_, i) => i !== subIdx)
    handleUpdateStage(stageIdx, { subquestions: newSubquestions })
  }

  const handleAddDisqualificationTrigger = (stageIdx: number) => {
    const stage = stages[stageIdx]
    const newTriggers = [...(stage.disqualification_triggers || []), { trigger: '', message: '' }]
    handleUpdateStage(stageIdx, { disqualification_triggers: newTriggers })
  }

  const handleUpdateDisqualificationTrigger = (
    stageIdx: number,
    trigIdx: number,
    field: 'trigger' | 'message',
    value: string
  ) => {
    const stage = stages[stageIdx]
    const newTriggers = [...(stage.disqualification_triggers || [])]
    newTriggers[trigIdx] = { ...newTriggers[trigIdx], [field]: value }
    handleUpdateStage(stageIdx, { disqualification_triggers: newTriggers })
  }

  const handleRemoveDisqualificationTrigger = (stageIdx: number, trigIdx: number) => {
    const stage = stages[stageIdx]
    const newTriggers = (stage.disqualification_triggers || []).filter((_, i) => i !== trigIdx)
    handleUpdateStage(stageIdx, { disqualification_triggers: newTriggers })
  }

  const handleNext = () => {
    wizard.goNext()
  }

  const isFormValid = stages.length > 0 && stages.every((s) => s.stage_name && s.question)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Configuração do Funil</h2>
        <p className="text-slate-500 mt-2">
          Configure os estágios de qualificação e as regras de disqualificação.
        </p>
      </div>

      <div className="space-y-4">
        {stages.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center">
            <p className="text-slate-500 mb-4">Nenhum estágio de qualificação configurado</p>
            <Button
              onClick={handleAddStage}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Primeiro Estágio
            </Button>
          </div>
        ) : (
          stages.map((stage, idx) => (
            <div
              key={idx}
              className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-semibold">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <Input
                      placeholder="Nome do estágio"
                      value={stage.stage_name || ''}
                      onChange={(e) =>
                        handleUpdateStage(idx, { stage_name: e.target.value })
                      }
                      className="font-semibold"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReorderStage(idx, 'up')}
                    disabled={idx === 0}
                    className="p-2 rounded hover:bg-slate-100 disabled:opacity-50"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleReorderStage(idx, 'down')}
                    disabled={idx === stages.length - 1}
                    className="p-2 rounded hover:bg-slate-100 disabled:opacity-50"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteStage(idx)}
                    className="p-2 rounded hover:bg-red-100 text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pergunta principal</Label>
                <Textarea
                  placeholder="Qual é a pergunta qualificadora principal?"
                  value={stage.question || ''}
                  onChange={(e) => handleUpdateStage(idx, { question: e.target.value })}
                  className="min-h-[60px]"
                />
              </div>

              <div className="space-y-3 pl-4 border-l-2 border-slate-200">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Sub-perguntas</Label>
                  <Button
                    onClick={() => handleAddSubquestion(idx)}
                    size="sm"
                    variant="ghost"
                    className="text-indigo-600 hover:bg-indigo-100"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Adicionar
                  </Button>
                </div>
                {(stage.subquestions || []).map((subq, subIdx) => (
                  <div key={subIdx} className="flex gap-2">
                    <Input
                      placeholder="Sub-pergunta"
                      value={subq}
                      onChange={(e) =>
                        handleUpdateSubquestion(idx, subIdx, e.target.value)
                      }
                    />
                    <button
                      onClick={() => handleRemoveSubquestion(idx, subIdx)}
                      className="p-1 rounded hover:bg-red-100 text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pl-4 border-l-2 border-slate-200">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Gatilhos de Desqualificação</Label>
                  <Button
                    onClick={() => handleAddDisqualificationTrigger(idx)}
                    size="sm"
                    variant="ghost"
                    className="text-indigo-600 hover:bg-indigo-100"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Adicionar
                  </Button>
                </div>
                {(stage.disqualification_triggers || []).map((trigger, trigIdx) => (
                  <div key={trigIdx} className="space-y-2">
                    <Input
                      placeholder="Gatilho (ex: 'sem orçamento')"
                      value={trigger.trigger}
                      onChange={(e) =>
                        handleUpdateDisqualificationTrigger(
                          idx,
                          trigIdx,
                          'trigger',
                          e.target.value
                        )
                      }
                    />
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Mensagem de resposta"
                        value={trigger.message}
                        onChange={(e) =>
                          handleUpdateDisqualificationTrigger(
                            idx,
                            trigIdx,
                            'message',
                            e.target.value
                          )
                        }
                        className="min-h-[40px] flex-1"
                      />
                      <button
                        onClick={() => handleRemoveDisqualificationTrigger(idx, trigIdx)}
                        className="p-1 rounded hover:bg-red-100 text-red-600 h-fit"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {stages.length > 0 && (
        <Button
          onClick={handleAddStage}
          variant="outline"
          className="w-full text-indigo-600 border-indigo-200 hover:bg-indigo-50"
        >
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Estágio
        </Button>
      )}

      <div className="flex justify-between">
        <Button
          onClick={() => wizard.goBack()}
          variant="outline"
          className="text-slate-900 border-slate-200"
        >
          Voltar
        </Button>
        <Button
          onClick={handleNext}
          disabled={!isFormValid}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Próximo
        </Button>
      </div>
    </div>
  )
}
