/**
 * CADENCE ENGINE v4
 * =================
 * Edge Function para processar cadências de vendas inteligentes.
 *
 * Funcionalidades:
 * - Processa fila de cadências (cadence_queue)
 * - Processa fila de regras de entrada (cadence_entry_queue)
 * - Cria tarefas com intervalos configuráveis
 * - Suporte a padrão de dias (day_pattern)
 * - Verifica pré-requisitos (requires_previous_completed)
 * - Respeita horário comercial (business hours)
 * - Avança cadências baseado em outcomes de tarefas
 * - Dead letter queue para falhas
 *
 * Chamada:
 * - POST /cadence-engine (processa fila + entry queue)
 * - POST /cadence-engine { action: 'start_cadence', card_id, template_id } (inicia cadência)
 * - POST /cadence-engine { action: 'cancel_cadence', instance_id } (cancela cadência)
 * - POST /cadence-engine { action: 'process_entry_queue' } (processa apenas entry queue)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { addMinutes, isWeekend, setHours, setMinutes, isAfter, isBefore, addDays, format } from "npm:date-fns@2.30.0";
import { utcToZonedTime, zonedTimeToUtc } from "npm:date-fns-tz@2.0.0";

const TIMEZONE = "America/Sao_Paulo";
const BUSINESS_HOURS_START = 9; // 09:00
const BUSINESS_HOURS_END = 18; // 18:00

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapeia prioridade do inglês para português (usado no banco)
function mapPrioridade(value: string | undefined): string {
    if (!value) return 'alta';
    const map: Record<string, string> = {
        'high': 'alta',
        'medium': 'media',
        'low': 'baixa',
        'alta': 'alta',
        'media': 'media',
        'baixa': 'baixa'
    };
    return map[value] || 'alta';
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const body = await req.json().catch(() => ({}));

        // Roteamento por ação
        switch (body.action) {
            case 'start_cadence':
                return await handleStartCadence(supabaseClient, body);

            case 'cancel_cadence':
                return await handleCancelCadence(supabaseClient, body);

            case 'advance_cadence':
                return await handleAdvanceCadence(supabaseClient, body);

            case 'process_task_outcome':
                return await handleTaskOutcome(supabaseClient, body);

            case 'process_entry_queue':
                return await processEntryQueue(supabaseClient);

            default:
                // Default: Process both queues
                const [queueResult, entryResult] = await Promise.all([
                    processQueue(supabaseClient),
                    processEntryQueue(supabaseClient)
                ]);

                // Return combined result
                const queueData = await queueResult.json();
                const entryData = await entryResult.json();

                return new Response(JSON.stringify({
                    success: true,
                    cadence_queue: queueData,
                    entry_queue: entryData
                }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
        }

    } catch (error) {
        console.error("Fatal error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

// ============================================================================
// MAIN: Process Queue
// ============================================================================

async function processQueue(supabaseClient: SupabaseClient) {
    const startTime = Date.now();
    let totalProcessed = 0;
    const results: any[] = [];
    const MAX_ITEMS = 100;
    const MAX_TIME_MS = 25000; // 25 segundos (buffer para timeout de 30s)

    console.log(`[CadenceEngine] Starting queue processing at ${new Date().toISOString()}`);

    // 1. Buscar items pendentes da fila
    const { data: queueItems, error: fetchError } = await supabaseClient
        .from("cadence_queue")
        .select(`
            *,
            instance:cadence_instances (
                *,
                template:cadence_templates (*)
            ),
            step:cadence_steps (*)
        `)
        .eq("status", "pending")
        .lte("execute_at", new Date().toISOString())
        .order("priority", { ascending: false })
        .order("execute_at", { ascending: true })
        .limit(MAX_ITEMS);

    if (fetchError) {
        console.error("[CadenceEngine] Error fetching queue:", fetchError);
        throw fetchError;
    }

    if (!queueItems || queueItems.length === 0) {
        return new Response(JSON.stringify({
            success: true,
            message: "No items to process",
            processed: 0
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    console.log(`[CadenceEngine] Found ${queueItems.length} items to process`);

    // 2. Processar cada item
    for (const item of queueItems) {
        // Check timeout
        if (Date.now() - startTime > MAX_TIME_MS) {
            console.log("[CadenceEngine] Approaching timeout, stopping processing");
            break;
        }

        try {
            // Marcar como processing
            await supabaseClient
                .from("cadence_queue")
                .update({
                    status: "processing",
                    claimed_at: new Date().toISOString(),
                    last_attempt_at: new Date().toISOString(),
                    attempts: item.attempts + 1
                })
                .eq("id", item.id);

            // Processar o step
            const result = await executeStep(supabaseClient, item);

            // Marcar como completed
            await supabaseClient
                .from("cadence_queue")
                .update({ status: "completed" })
                .eq("id", item.id);

            results.push({ id: item.id, success: true, result });
            totalProcessed++;

        } catch (error) {
            console.error(`[CadenceEngine] Error processing item ${item.id}:`, error);

            // Verificar se deve ir para dead letter ou retry
            if (item.attempts >= item.max_attempts) {
                // Dead letter
                await supabaseClient.from("cadence_dead_letter").insert({
                    original_queue_id: item.id,
                    instance_id: item.instance_id,
                    step_id: item.step_id,
                    error_message: error.message,
                    error_details: { stack: error.stack }
                });

                await supabaseClient
                    .from("cadence_queue")
                    .update({ status: "failed", last_error: error.message })
                    .eq("id", item.id);

            } else {
                // Retry com backoff exponencial
                const retryDelay = Math.pow(2, item.attempts) * 60 * 1000; // 1min, 2min, 4min...
                await supabaseClient
                    .from("cadence_queue")
                    .update({
                        status: "pending",
                        execute_at: new Date(Date.now() + retryDelay).toISOString(),
                        last_error: error.message
                    })
                    .eq("id", item.id);
            }

            results.push({ id: item.id, success: false, error: error.message });
        }
    }

    const duration = Date.now() - startTime;
    console.log(`[CadenceEngine] Processed ${totalProcessed} items in ${duration}ms`);

    return new Response(JSON.stringify({
        success: true,
        processed: totalProcessed,
        duration_ms: duration,
        results
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

// ============================================================================
// Process Entry Queue (Regras de Entrada)
// ============================================================================

async function processEntryQueue(supabaseClient: SupabaseClient) {
    const startTime = Date.now();
    let totalProcessed = 0;
    const results: any[] = [];
    const MAX_ITEMS = 50;

    console.log(`[CadenceEngine] Processing entry queue at ${new Date().toISOString()}`);

    // Buscar items pendentes da fila de entrada
    const { data: entryItems, error: fetchError } = await supabaseClient
        .from("cadence_entry_queue")
        .select(`
            *,
            trigger:cadence_event_triggers (*)
        `)
        .eq("status", "pending")
        .lte("execute_at", new Date().toISOString())
        .order("created_at", { ascending: true })
        .limit(MAX_ITEMS);

    if (fetchError) {
        console.error("[CadenceEngine] Error fetching entry queue:", fetchError);
        return new Response(JSON.stringify({
            success: false,
            error: fetchError.message
        }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (!entryItems || entryItems.length === 0) {
        return new Response(JSON.stringify({
            success: true,
            message: "No entry items to process",
            processed: 0
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    console.log(`[CadenceEngine] Found ${entryItems.length} entry items to process`);

    for (const item of entryItems) {
        try {
            // Marcar como processing
            await supabaseClient
                .from("cadence_entry_queue")
                .update({
                    status: "processing",
                    attempts: item.attempts + 1
                })
                .eq("id", item.id);

            // Processar baseado no action_type do trigger
            const trigger = item.trigger;
            if (!trigger) {
                throw new Error("Trigger not found for entry item");
            }

            let result;
            if (trigger.action_type === 'create_task') {
                result = await executeCreateTaskAction(supabaseClient, item.card_id, trigger);
            } else if (trigger.action_type === 'start_cadence') {
                result = await executeStartCadenceAction(supabaseClient, item.card_id, trigger);
            } else {
                throw new Error(`Unknown action type: ${trigger.action_type}`);
            }

            // Marcar como completed
            await supabaseClient
                .from("cadence_entry_queue")
                .update({
                    status: "completed",
                    processed_at: new Date().toISOString()
                })
                .eq("id", item.id);

            results.push({ id: item.id, success: true, result });
            totalProcessed++;

        } catch (error) {
            console.error(`[CadenceEngine] Error processing entry item ${item.id}:`, error);

            if (item.attempts >= item.max_attempts) {
                await supabaseClient
                    .from("cadence_entry_queue")
                    .update({
                        status: "failed",
                        last_error: error.message
                    })
                    .eq("id", item.id);
            } else {
                await supabaseClient
                    .from("cadence_entry_queue")
                    .update({
                        status: "pending",
                        last_error: error.message
                    })
                    .eq("id", item.id);
            }

            results.push({ id: item.id, success: false, error: error.message });
        }
    }

    const duration = Date.now() - startTime;
    console.log(`[CadenceEngine] Processed ${totalProcessed} entry items in ${duration}ms`);

    return new Response(JSON.stringify({
        success: true,
        processed: totalProcessed,
        duration_ms: duration,
        results
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

// ============================================================================
// Entry Queue Actions
// ============================================================================

async function executeCreateTaskAction(
    supabaseClient: SupabaseClient,
    cardId: string,
    trigger: any
) {
    const taskConfig = trigger.task_config || {};
    const taskTipo = taskConfig.tipo || 'contato';

    // =========================================================================
    // REGRA ANTI-DUPLICATA: Não criar tarefa se já existe uma pendente do mesmo tipo
    // =========================================================================
    const { data: existingTasks } = await supabaseClient
        .from("tarefas")
        .select("id, titulo, tipo, concluida")
        .eq("card_id", cardId)
        .eq("tipo", taskTipo)
        .eq("concluida", false)
        .limit(1);

    if (existingTasks && existingTasks.length > 0) {
        console.log(`[CadenceEngine] Skipping task creation - already exists uncompleted "${taskTipo}" task for card ${cardId}`);

        // Log que foi pulado
        await supabaseClient.from("cadence_event_log").insert({
            card_id: cardId,
            event_type: 'entry_rule_task_skipped',
            event_source: 'entry_trigger',
            event_data: {
                trigger_id: trigger.id,
                trigger_name: trigger.name,
                task_tipo: taskTipo,
                reason: 'existing_uncompleted_task',
                existing_task_id: existingTasks[0].id
            },
            action_taken: 'skip_duplicate'
        });

        return {
            skipped: true,
            reason: 'existing_uncompleted_task',
            existing_task_id: existingTasks[0].id
        };
    }
    // =========================================================================

    // Buscar card para obter responsável
    const { data: card, error: cardError } = await supabaseClient
        .from("cards")
        .select("id, dono_atual_id, responsavel_id")
        .eq("id", cardId)
        .single();

    if (cardError || !card) {
        throw new Error(`Card not found: ${cardId}`);
    }

    // Calcular data de vencimento
    let dueDate = new Date();
    if (trigger.delay_minutes > 0) {
        if (trigger.delay_type === 'business') {
            // Usar configurações customizadas de horário comercial do trigger
            const businessConfig: BusinessHoursConfig = {
                start: trigger.business_hours_start ?? BUSINESS_HOURS_START,
                end: trigger.business_hours_end ?? BUSINESS_HOURS_END,
                allowedWeekdays: trigger.allowed_weekdays ?? [1, 2, 3, 4, 5]
            };
            dueDate = calculateBusinessTime(new Date(), trigger.delay_minutes, businessConfig);
        } else {
            dueDate = addMinutes(new Date(), trigger.delay_minutes);
        }
    }

    // Determinar responsável (entry rule pode ter pessoa específica)
    let assignToId = card.dono_atual_id || card.responsavel_id;
    if (taskConfig.assign_to === 'specific' && taskConfig.assign_to_user_id) {
        assignToId = taskConfig.assign_to_user_id;
    }

    // Criar tarefa
    const { data: task, error: taskError } = await supabaseClient
        .from("tarefas")
        .insert({
            card_id: cardId,
            tipo: taskTipo,
            titulo: taskConfig.titulo || 'Tarefa Automática',
            descricao: taskConfig.descricao || '',
            responsavel_id: assignToId,
            prioridade: mapPrioridade(taskConfig.prioridade) || 'alta',
            data_vencimento: dueDate.toISOString(),
            metadata: {
                created_by_trigger: trigger.id,
                trigger_name: trigger.name
            }
        })
        .select()
        .single();

    if (taskError) {
        throw new Error(`Failed to create task: ${taskError.message}`);
    }

    // Log
    await supabaseClient.from("cadence_event_log").insert({
        card_id: cardId,
        event_type: 'entry_rule_task_created',
        event_source: 'entry_trigger',
        event_data: {
            trigger_id: trigger.id,
            trigger_name: trigger.name,
            task_tipo: taskConfig.tipo
        },
        action_taken: 'create_task',
        action_result: { task_id: task.id }
    });

    return { task_id: task.id };
}

async function executeStartCadenceAction(
    supabaseClient: SupabaseClient,
    cardId: string,
    trigger: any
) {
    const templateId = trigger.target_template_id;

    if (!templateId) {
        throw new Error("No target_template_id configured for start_cadence action");
    }

    // Verificar se já existe cadência ativa para este template/card
    const { data: existing } = await supabaseClient
        .from("cadence_instances")
        .select("id")
        .eq("card_id", cardId)
        .eq("template_id", templateId)
        .in("status", ['active', 'waiting_task', 'paused'])
        .single();

    if (existing) {
        console.log(`[CadenceEngine] Cadence already active for card ${cardId}, template ${templateId}`);
        return { skipped: true, reason: 'already_active', instance_id: existing.id };
    }

    // Buscar template e primeiro step
    const { data: template, error: templateError } = await supabaseClient
        .from("cadence_templates")
        .select("*")
        .eq("id", templateId)
        .single();

    if (templateError || !template) {
        throw new Error(`Template not found: ${templateId}`);
    }

    const { data: firstStep, error: stepError } = await supabaseClient
        .from("cadence_steps")
        .select("*")
        .eq("template_id", templateId)
        .order("step_order", { ascending: true })
        .limit(1)
        .single();

    if (stepError || !firstStep) {
        throw new Error("Template has no steps");
    }

    // Criar instância
    const { data: instance, error: instanceError } = await supabaseClient
        .from("cadence_instances")
        .insert({
            card_id: cardId,
            template_id: templateId,
            current_step_id: firstStep.id,
            status: 'active'
        })
        .select()
        .single();

    if (instanceError) {
        throw instanceError;
    }

    // Calcular quando executar o primeiro step
    let executeAt = new Date();
    if (template.schedule_mode === 'day_pattern' && firstStep.day_offset !== null) {
        // Day pattern mode - calcular baseado no dia
        executeAt = calculateDayOffset(new Date(), firstStep.day_offset, template);
    }

    // Enfileirar primeiro step
    await supabaseClient.from("cadence_queue").insert({
        instance_id: instance.id,
        step_id: firstStep.id,
        execute_at: executeAt.toISOString(),
        priority: 8
    });

    // Log
    await supabaseClient.from("cadence_event_log").insert({
        instance_id: instance.id,
        card_id: cardId,
        event_type: 'cadence_started_by_trigger',
        event_source: 'entry_trigger',
        event_data: {
            trigger_id: trigger.id,
            trigger_name: trigger.name,
            template_id: templateId
        },
        action_taken: 'start_cadence',
        action_result: { instance_id: instance.id }
    });

    return { instance_id: instance.id };
}

// ============================================================================
// Day Pattern Helpers
// ============================================================================

function calculateDayOffset(
    fromDate: Date,
    dayOffset: number,
    template: any
): Date {
    const localTime = utcToZonedTime(fromDate, TIMEZONE);
    let result = addDays(localTime, dayOffset);

    // Ajustar para horário comercial se configurado
    if (template.respect_business_hours) {
        const businessStart = template.business_hours_start || BUSINESS_HOURS_START;
        result = setHours(setMinutes(result, 0), businessStart);

        // Pular fins de semana se necessário
        const allowedWeekdays = template.allowed_weekdays || [1, 2, 3, 4, 5];
        while (!allowedWeekdays.includes(result.getDay() === 0 ? 7 : result.getDay())) {
            result = addDays(result, 1);
        }
    }

    return zonedTimeToUtc(result, TIMEZONE);
}

// ============================================================================
// Execute Step
// ============================================================================

async function executeStep(supabaseClient: SupabaseClient, queueItem: any) {
    const { instance, step } = queueItem;

    if (!instance || !step) {
        throw new Error("Missing instance or step data");
    }

    // Verificar se instância ainda está ativa
    if (instance.status !== 'active' && instance.status !== 'waiting_task') {
        console.log(`[CadenceEngine] Instance ${instance.id} is ${instance.status}, skipping`);
        return { skipped: true, reason: `instance_${instance.status}` };
    }

    // Buscar card
    const { data: card, error: cardError } = await supabaseClient
        .from("cards")
        .select("*, pipeline_stages(*)")
        .eq("id", instance.card_id)
        .single();

    if (cardError || !card) {
        throw new Error(`Card not found: ${instance.card_id}`);
    }

    // Executar baseado no tipo de step
    switch (step.step_type) {
        case 'task':
            return await executeTaskStep(supabaseClient, instance, step, card);

        case 'wait':
            return await executeWaitStep(supabaseClient, instance, step, card);

        case 'branch':
            return await executeBranchStep(supabaseClient, instance, step, card);

        case 'end':
            return await executeEndStep(supabaseClient, instance, step, card);

        default:
            throw new Error(`Unknown step type: ${step.step_type}`);
    }
}

// ============================================================================
// Step Executors
// ============================================================================

async function executeTaskStep(
    supabaseClient: SupabaseClient,
    instance: any,
    step: any,
    card: any
) {
    const config = step.task_config || {};
    const taskTipo = config.tipo || 'contato';

    // =========================================================================
    // REGRA ANTI-DUPLICATA: Não criar tarefa se já existe uma pendente do mesmo tipo
    // =========================================================================
    const { data: existingTasks } = await supabaseClient
        .from("tarefas")
        .select("id, titulo, tipo, concluida")
        .eq("card_id", card.id)
        .eq("tipo", taskTipo)
        .eq("concluida", false)
        .limit(1);

    if (existingTasks && existingTasks.length > 0) {
        console.log(`[CadenceEngine] Cadence step skipped - already exists uncompleted "${taskTipo}" task for card ${card.id}`);

        // Atualizar instância para waiting_task
        await supabaseClient
            .from("cadence_instances")
            .update({
                status: 'waiting_task',
                waiting_for_task_id: existingTasks[0].id
            })
            .eq("id", instance.id);

        // Log
        await logEvent(supabaseClient, {
            instance_id: instance.id,
            card_id: card.id,
            event_type: 'step_waiting_for_task',
            event_source: 'cadence_engine',
            event_data: {
                step_id: step.id,
                task_tipo: taskTipo,
                existing_task_id: existingTasks[0].id,
                reason: 'existing_uncompleted_task'
            },
            action_taken: 'wait_for_completion'
        });

        return {
            skipped: true,
            reason: 'existing_uncompleted_task',
            existing_task_id: existingTasks[0].id,
            waiting: true
        };
    }
    // =========================================================================

    // Determinar responsável
    let assignToId = card.responsavel_id;
    if (config.assign_to === 'specific' && config.assign_to_user_id) {
        assignToId = config.assign_to_user_id;
    }

    // Calcular data de vencimento respeitando business hours do template
    const template = instance.template || {};
    let taskDueDate = new Date();
    if (template.respect_business_hours) {
        const businessConfig: BusinessHoursConfig = {
            start: template.business_hours_start ?? BUSINESS_HOURS_START,
            end: template.business_hours_end ?? BUSINESS_HOURS_END,
            allowedWeekdays: template.allowed_weekdays ?? [1, 2, 3, 4, 5]
        };
        taskDueDate = calculateBusinessTime(new Date(), 0, businessConfig);
    }

    // Criar tarefa
    const { data: task, error: taskError } = await supabaseClient
        .from("tarefas")
        .insert({
            card_id: card.id,
            tipo: taskTipo,
            titulo: config.titulo || `Tarefa da Cadência`,
            descricao: config.descricao || '',
            responsavel_id: assignToId,
            prioridade: mapPrioridade(config.prioridade),
            data_vencimento: taskDueDate.toISOString(),
            metadata: {
                cadence_instance_id: instance.id,
                cadence_step_id: step.id,
                cadence_step_key: step.step_key,
                created_at_stage_id: card.pipeline_stage_id
            }
        })
        .select()
        .single();

    if (taskError) {
        throw new Error(`Failed to create task: ${taskError.message}`);
    }

    // Log do evento
    await logEvent(supabaseClient, {
        instance_id: instance.id,
        card_id: card.id,
        event_type: 'task_created',
        event_source: 'cadence_engine',
        event_data: {
            step_key: step.step_key,
            task_tipo: config.tipo
        },
        action_taken: 'create_task',
        action_result: { task_id: task.id, task_titulo: task.titulo }
    });

    // Atualizar instância
    await supabaseClient
        .from("cadence_instances")
        .update({
            current_step_id: step.id,
            status: config.wait_for_outcome ? 'waiting_task' : 'active',
            total_contacts_attempted: instance.total_contacts_attempted + 1
        })
        .eq("id", instance.id);

    // Se não precisa esperar outcome, agendar próximo step
    if (!config.wait_for_outcome && step.next_step_key) {
        await scheduleNextStep(supabaseClient, instance, step.next_step_key, 0);
    }

    return { task_id: task.id, wait_for_outcome: config.wait_for_outcome };
}

async function executeWaitStep(
    supabaseClient: SupabaseClient,
    instance: any,
    step: any,
    card: any
) {
    const config = step.wait_config || {};
    const durationMinutes = config.duration_minutes || 60;
    const durationType = config.duration_type || 'business';
    const template = instance.template || {};

    // Calcular próximo horário de execução
    let executeAt: Date;
    if (durationType === 'business') {
        // Usar configurações de business hours do template da cadência
        const businessConfig: BusinessHoursConfig = {
            start: template.business_hours_start ?? BUSINESS_HOURS_START,
            end: template.business_hours_end ?? BUSINESS_HOURS_END,
            allowedWeekdays: template.allowed_weekdays ?? [1, 2, 3, 4, 5]
        };
        executeAt = calculateBusinessTime(new Date(), durationMinutes, businessConfig);
    } else {
        executeAt = addMinutes(new Date(), durationMinutes);
    }

    // Agendar próximo step
    if (step.next_step_key) {
        await scheduleNextStep(supabaseClient, instance, step.next_step_key, 0, executeAt);
    }

    // Log
    await logEvent(supabaseClient, {
        instance_id: instance.id,
        card_id: card.id,
        event_type: 'wait_started',
        event_source: 'cadence_engine',
        event_data: {
            step_key: step.step_key,
            duration_minutes: durationMinutes,
            duration_type: durationType,
            execute_at: executeAt.toISOString()
        },
        action_taken: 'schedule_next_step',
        action_result: { next_step_key: step.next_step_key }
    });

    return { wait_until: executeAt.toISOString(), next_step: step.next_step_key };
}

async function executeBranchStep(
    supabaseClient: SupabaseClient,
    instance: any,
    step: any,
    card: any
) {
    const config = step.branch_config || {};
    const branches = config.branches || [];

    let targetStepKey = step.next_step_key; // default

    // Avaliar cada branch
    for (const branch of branches) {
        if (await evaluateCondition(supabaseClient, branch.condition, card, instance)) {
            targetStepKey = branch.target_step_key;
            break;
        }
    }

    // Agendar step alvo
    if (targetStepKey) {
        await scheduleNextStep(supabaseClient, instance, targetStepKey, 0);
    }

    return { branch_taken: targetStepKey };
}

async function executeEndStep(
    supabaseClient: SupabaseClient,
    instance: any,
    step: any,
    card: any
) {
    const config = step.end_config || {};

    // Marcar cadência como completada
    await supabaseClient
        .from("cadence_instances")
        .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            context: {
                ...instance.context,
                end_result: config.result
            }
        })
        .eq("id", instance.id);

    // Mover card se configurado
    if (config.move_to_stage_id) {
        await supabaseClient
            .from("cards")
            .update({
                pipeline_stage_id: config.move_to_stage_id,
                motivo_perda_id: config.motivo_perda_id || null,
                updated_at: new Date().toISOString()
            })
            .eq("id", card.id);
    }

    // Log
    await logEvent(supabaseClient, {
        instance_id: instance.id,
        card_id: card.id,
        event_type: 'cadence_completed',
        event_source: 'cadence_engine',
        event_data: {
            result: config.result,
            total_contacts: instance.total_contacts_attempted,
            successful_contacts: instance.successful_contacts
        },
        action_taken: config.move_to_stage_id ? 'move_card' : 'complete_only',
        action_result: {
            move_to_stage_id: config.move_to_stage_id,
            motivo_perda_id: config.motivo_perda_id
        }
    });

    return { completed: true, result: config.result };
}

// ============================================================================
// Handlers
// ============================================================================

async function handleStartCadence(supabaseClient: SupabaseClient, body: any) {
    const { card_id, template_id } = body;

    if (!card_id || !template_id) {
        return new Response(JSON.stringify({
            error: "card_id and template_id are required"
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verificar se já existe cadência ativa
    const { data: existing } = await supabaseClient
        .from("cadence_instances")
        .select("id")
        .eq("card_id", card_id)
        .eq("template_id", template_id)
        .in("status", ['active', 'waiting_task', 'paused'])
        .single();

    if (existing) {
        return new Response(JSON.stringify({
            error: "Cadence already active for this card/template",
            instance_id: existing.id
        }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Buscar primeiro step do template
    const { data: firstStep, error: stepError } = await supabaseClient
        .from("cadence_steps")
        .select("*")
        .eq("template_id", template_id)
        .order("step_order", { ascending: true })
        .limit(1)
        .single();

    if (stepError || !firstStep) {
        return new Response(JSON.stringify({
            error: "Template has no steps"
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Criar instância
    const { data: instance, error: instanceError } = await supabaseClient
        .from("cadence_instances")
        .insert({
            card_id,
            template_id,
            current_step_id: firstStep.id,
            status: 'active'
        })
        .select()
        .single();

    if (instanceError) {
        throw instanceError;
    }

    // Agendar primeiro step
    await supabaseClient.from("cadence_queue").insert({
        instance_id: instance.id,
        step_id: firstStep.id,
        execute_at: new Date().toISOString(),
        priority: 8
    });

    // Log
    await logEvent(supabaseClient, {
        instance_id: instance.id,
        card_id,
        event_type: 'cadence_started',
        event_source: 'api',
        event_data: { template_id },
        action_taken: 'create_instance',
        action_result: { instance_id: instance.id }
    });

    return new Response(JSON.stringify({
        success: true,
        instance_id: instance.id
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleCancelCadence(supabaseClient: SupabaseClient, body: any) {
    const { instance_id, reason } = body;

    if (!instance_id) {
        return new Response(JSON.stringify({
            error: "instance_id is required"
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cancelar instância
    await supabaseClient
        .from("cadence_instances")
        .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_reason: reason || 'manual'
        })
        .eq("id", instance_id);

    // Cancelar items na fila
    await supabaseClient
        .from("cadence_queue")
        .update({ status: 'cancelled' })
        .eq("instance_id", instance_id)
        .eq("status", "pending");

    return new Response(JSON.stringify({
        success: true,
        message: "Cadence cancelled"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleAdvanceCadence(supabaseClient: SupabaseClient, body: any) {
    const { instance_id, next_step_key, outcome } = body;

    if (!instance_id) {
        return new Response(JSON.stringify({
            error: "instance_id is required"
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Buscar instância
    const { data: instance, error } = await supabaseClient
        .from("cadence_instances")
        .select("*, template:cadence_templates(*)")
        .eq("id", instance_id)
        .single();

    if (error || !instance) {
        return new Response(JSON.stringify({
            error: "Instance not found"
        }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Atualizar contadores se tiver outcome de sucesso
    if (outcome === 'respondido_pelo_cliente') {
        await supabaseClient
            .from("cadence_instances")
            .update({
                successful_contacts: instance.successful_contacts + 1,
                status: 'active'
            })
            .eq("id", instance_id);
    } else {
        await supabaseClient
            .from("cadence_instances")
            .update({ status: 'active' })
            .eq("id", instance_id);
    }

    // Agendar próximo step
    if (next_step_key) {
        await scheduleNextStep(supabaseClient, instance, next_step_key, 0);
    }

    return new Response(JSON.stringify({
        success: true,
        next_step_key
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleTaskOutcome(supabaseClient: SupabaseClient, body: any) {
    const { task_id, outcome } = body;

    if (!task_id || !outcome) {
        return new Response(JSON.stringify({
            error: "task_id and outcome are required"
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Buscar tarefa com metadata de cadência
    const { data: task, error } = await supabaseClient
        .from("tarefas")
        .select("*")
        .eq("id", task_id)
        .single();

    if (error || !task) {
        return new Response(JSON.stringify({
            error: "Task not found"
        }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const instanceId = task.metadata?.cadence_instance_id;
    if (!instanceId) {
        return new Response(JSON.stringify({
            success: true,
            message: "Task is not part of a cadence"
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Buscar instância e step atual
    const { data: instance } = await supabaseClient
        .from("cadence_instances")
        .select("*, current_step:cadence_steps(*)")
        .eq("id", instanceId)
        .single();

    if (!instance || instance.status !== 'waiting_task') {
        return new Response(JSON.stringify({
            success: true,
            message: "Cadence is not waiting for task outcome"
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Avançar para próximo step
    const nextStepKey = instance.current_step?.next_step_key;
    if (nextStepKey) {
        // Atualizar status e agendar próximo
        await supabaseClient
            .from("cadence_instances")
            .update({
                status: 'active',
                successful_contacts: outcome === 'respondido_pelo_cliente'
                    ? instance.successful_contacts + 1
                    : instance.successful_contacts
            })
            .eq("id", instanceId);

        await scheduleNextStep(supabaseClient, instance, nextStepKey, 0);
    }

    return new Response(JSON.stringify({
        success: true,
        advanced_to: nextStepKey
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// Helpers
// ============================================================================

async function scheduleNextStep(
    supabaseClient: SupabaseClient,
    instance: any,
    stepKey: string,
    delayMinutes: number = 0,
    executeAt?: Date
) {
    // Buscar step pelo key
    const { data: step, error } = await supabaseClient
        .from("cadence_steps")
        .select("*")
        .eq("template_id", instance.template_id)
        .eq("step_key", stepKey)
        .single();

    if (error || !step) {
        console.error(`[CadenceEngine] Step not found: ${stepKey}`);
        return;
    }

    const scheduledAt = executeAt || addMinutes(new Date(), delayMinutes);

    await supabaseClient.from("cadence_queue").insert({
        instance_id: instance.id,
        step_id: step.id,
        execute_at: scheduledAt.toISOString(),
        priority: 5
    });

    console.log(`[CadenceEngine] Scheduled step ${stepKey} for ${scheduledAt.toISOString()}`);
}

async function evaluateCondition(
    supabaseClient: SupabaseClient,
    condition: any,
    card: any,
    instance: any
): Promise<boolean> {
    if (!condition) return false;

    let result = false;
    const logContext = {
        condition_type: condition.type,
        card_id: card?.id,
        instance_id: instance?.id,
        card_stage_id: card?.pipeline_stage_id
    };

    switch (condition.type) {
        case 'task_outcome':
            result = instance.context?.last_outcome === condition.outcome;
            console.log(`[CadenceEngine] evaluateCondition: task_outcome`, {
                ...logContext,
                expected: condition.outcome,
                actual: instance.context?.last_outcome,
                result
            });
            return result;

        case 'card_in_stage':
            result = card.pipeline_stage_id === condition.stage_id;
            console.log(`[CadenceEngine] evaluateCondition: card_in_stage`, {
                ...logContext,
                expected_stage: condition.stage_id,
                result
            });
            return result;

        case 'card_in_stages':
            result = condition.stage_ids?.includes(card.pipeline_stage_id);
            console.log(`[CadenceEngine] evaluateCondition: card_in_stages`, {
                ...logContext,
                expected_stages: condition.stage_ids,
                result
            });
            return result;

        case 'successful_contacts_gte':
            result = instance.successful_contacts >= condition.value;
            console.log(`[CadenceEngine] evaluateCondition: successful_contacts_gte`, {
                ...logContext,
                expected_min: condition.value,
                actual: instance.successful_contacts,
                result
            });
            return result;

        case 'total_contacts_gte':
            result = instance.total_contacts_attempted >= condition.value;
            console.log(`[CadenceEngine] evaluateCondition: total_contacts_gte`, {
                ...logContext,
                expected_min: condition.value,
                actual: instance.total_contacts_attempted,
                result
            });
            return result;

        default:
            console.warn(`[CadenceEngine] WARNING: Unknown condition type "${condition.type}"`, {
                ...logContext,
                full_condition: JSON.stringify(condition)
            });
            return false;
    }
}

interface BusinessHoursConfig {
    start: number;
    end: number;
    allowedWeekdays: number[]; // 1=Seg, 2=Ter, ..., 7=Dom
}

function isAllowedWeekday(date: Date, allowedWeekdays: number[]): boolean {
    // JavaScript getDay(): 0=Dom, 1=Seg, ..., 6=Sáb
    // Nossa convenção: 1=Seg, ..., 7=Dom
    const jsDay = date.getDay();
    const ourDay = jsDay === 0 ? 7 : jsDay; // Converter 0 (Dom) para 7
    return allowedWeekdays.includes(ourDay);
}

function calculateBusinessTime(
    fromDate: Date,
    minutesToAdd: number,
    config?: BusinessHoursConfig
): Date {
    const businessStart = config?.start ?? BUSINESS_HOURS_START;
    const businessEnd = config?.end ?? BUSINESS_HOURS_END;
    const allowedWeekdays = config?.allowedWeekdays ?? [1, 2, 3, 4, 5]; // Seg-Sex por padrão

    const localTime = utcToZonedTime(fromDate, TIMEZONE);
    let result = new Date(localTime);
    let remainingMinutes = minutesToAdd;

    while (remainingMinutes > 0) {
        // Pular para próximo dia útil se necessário (usando allowed_weekdays)
        while (!isAllowedWeekday(result, allowedWeekdays)) {
            result = addDays(result, 1);
            result = setHours(setMinutes(result, 0), businessStart);
        }

        // Se antes do horário comercial, ajustar para início
        const startOfBusiness = setHours(setMinutes(result, 0), businessStart);
        if (isBefore(result, startOfBusiness)) {
            result = startOfBusiness;
        }

        // Se depois do horário comercial, ir para próximo dia
        const endOfBusiness = setHours(setMinutes(result, 0), businessEnd);
        if (isAfter(result, endOfBusiness)) {
            result = addDays(result, 1);
            result = setHours(setMinutes(result, 0), businessStart);
            continue;
        }

        // Calcular minutos disponíveis hoje
        const minutesUntilEndOfBusiness = Math.floor(
            (endOfBusiness.getTime() - result.getTime()) / (1000 * 60)
        );

        if (remainingMinutes <= minutesUntilEndOfBusiness) {
            result = addMinutes(result, remainingMinutes);
            remainingMinutes = 0;
        } else {
            remainingMinutes -= minutesUntilEndOfBusiness;
            result = addDays(result, 1);
            result = setHours(setMinutes(result, 0), businessStart);
        }
    }

    return zonedTimeToUtc(result, TIMEZONE);
}

async function logEvent(supabaseClient: SupabaseClient, data: {
    instance_id?: string;
    card_id?: string;
    event_type: string;
    event_source: string;
    event_data?: any;
    action_taken?: string;
    action_result?: any;
}) {
    try {
        await supabaseClient.from("cadence_event_log").insert(data);
    } catch (error) {
        console.error("[CadenceEngine] Error logging event:", error);
    }
}
