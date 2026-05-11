import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Hono } from "jsr:@hono/hono";
import { cors } from "jsr:@hono/hono/cors";
import { describeRoute, OpenAPIHono } from "npm:@hono/zod-openapi";
import { z } from "npm:zod";
import { swaggerUI } from "npm:@hono/swagger-ui";

// ============================================
// WelcomeCRM Public API (v2)
// Built with Hono + Zod + OpenAPI
// ============================================

const app = new OpenAPIHono().basePath('/public-api');

// ---- Middleware ----
app.use("/*", cors());

// Authentication Middleware
app.use("/*", async (c, next) => {
    // Skip auth for docs and health
    if (c.req.path.includes("/openapi.json") || c.req.path.includes("/health") || c.req.path.includes("/docs")) {
        return await next();
    }

    const apiKey = c.req.header("X-API-Key");
    if (!apiKey) {
        return c.json({ error: "Missing X-API-Key header" }, 401);
    }

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Validate Key
    const { data, error } = await supabase.rpc("validate_api_key", { p_key: apiKey });

    if (error || !data || data.length === 0 || !data[0].is_valid) {
        return c.json({ error: "Invalid API Key" }, 401);
    }

    const keyData = data[0];
    c.set("apiKey", keyData);
    c.set("supabase", supabase);

    // ---- DEBUG LOGGING (Fire and Forget) ----
    try {
        const clonedReq = c.req.raw.clone();
        const contentType = clonedReq.headers.get("content-type");
        let payload = null;
        if (contentType?.includes("application/json")) {
            payload = await clonedReq.json();
        } else if (contentType?.includes("application/x-www-form-urlencoded")) {
            const text = await clonedReq.text();
            payload = Object.fromEntries(new URLSearchParams(text));
        }

        console.log(`[PublicAPI] Incoming ${c.req.method} ${c.req.path}`);

        supabase.from("debug_requests").insert({
            function_name: "public-api",
            method: c.req.method,
            url: c.req.url,
            headers: Object.fromEntries(c.req.header()),
            payload: payload
        }).then(({ error }) => {
            if (error) console.error("Failed to log to debug_requests:", error);
        });
    } catch (e) {
        console.error("Debug logging failed:", e);
    }
    // -----------------------------------------

    // Log Request (Async - Fire and Forget)
    const startTime = Date.now();
    await next();
    const endTime = Date.now();

    // Log to DB
    supabase.from("api_request_logs").insert({
        api_key_id: keyData.key_id,
        endpoint: c.req.path,
        method: c.req.method,
        status_code: c.res.status,
        response_time_ms: endTime - startTime,
        ip_address: c.req.header("x-forwarded-for"),
        user_agent: c.req.header("user-agent"),
    }).then();
});

// ---- Pipeline Map (must match src/lib/constants.ts) ----
const PIPELINE_MAP: Record<string, string> = {
    TRIPS:   'c8022522-4a1d-411c-9387-efe03ca725ee',
    WEDDING: 'f4611f84-ce9c-48ad-814b-dcd6081f15db',
};

// ---- Schemas (Zod) ----

const ErrorSchema = z.object({
    error: z.string().openapi({ example: "Invalid request" }),
});

const DealSchema = z.object({
    id: z.string().uuid(),
    titulo: z.string(),
    valor_estimado: z.number().nullable(),
    pipeline_stage_id: z.string().uuid().nullable(),
    created_at: z.string().datetime(),
});

const CreateDealSchema = z.object({
    titulo: z.string().min(1).openapi({ example: "New Enterprise Deal" }),
    valor_estimado: z.number().optional().openapi({ example: 50000 }),
    pipeline_stage_id: z.string().uuid().optional().openapi({ example: "uuid-of-stage" }),
    pessoa_principal_id: z.string().uuid().optional(),
});

const ContactSchema = z.object({
    id: z.string().uuid(),
    nome: z.string(),
    email: z.string().email().nullable(),
    telefone: z.string().nullable(),
});

const CreateContactSchema = z.object({
    nome: z.string().min(1).openapi({ example: "John" }),
    sobrenome: z.string().min(1).openapi({ example: "Doe" }),
    email: z.string().email().optional().openapi({ example: "john@example.com" }),
    telefone: z.string().min(1).openapi({ example: "+5511999999999" }),
});

const ContactDetailSchema = z.object({
    id: z.string().uuid(),
    nome: z.string(),
    email: z.string().email().nullable(),
    telefone: z.string().nullable(),
    last_whatsapp_conversation_id: z.string().nullable().optional(), // External ID (Phone)
    active_conversation_id: z.string().uuid().nullable().optional(), // Internal UUID
    whatsapp_conversations: z.array(z.object({
        id: z.string(),
        status: z.string().nullable(),
        unread_count: z.number().nullable(),
        last_message_at: z.string().nullable(),
    })).optional(),
    deals: z.array(z.object({
        id: z.string(),
        titulo: z.string(),
        status_comercial: z.string().nullable(),
        pipeline_stage_id: z.string().nullable(),
    })).optional(),
});

const EchoWebhookSchema = z.object({
    event: z.string().openapi({ example: "action_button.clicked" }),
    timestamp: z.string().optional(),
    button_label: z.string().optional(),
    contact: z.object({
        id: z.string().openapi({ description: "Echo conversation ID" }),
        name: z.string().min(1),
        phone: z.string().min(8),
    }),
    agent: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        email: z.string().email(),
    }).optional(),
    organization: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
    }).optional(),
    phone_number: z.object({
        id: z.string(),
        display_name: z.string().optional(),
        number: z.string(),
    }),
});

const EchoDealResponseSchema = z.object({
    id: z.string().uuid(),
    titulo: z.string(),
    produto: z.string(),
    pipeline_stage_id: z.string().uuid().nullable(),
    contact_id: z.string().uuid(),
    contact_created: z.boolean(),
    dedup: z.boolean(),
    created_at: z.string(),
});

// ---- Routes ----

// 1. Health Check
app.openapi(
    {
        method: "get",
        path: "/health",
        summary: "Health Check",
        description: "Check if the API is running",
        responses: {
            200: {
                description: "OK",
                content: { "application/json": { schema: z.object({ status: z.string() }) } },
            },
        },
    },
    (c) => c.json({ status: "ok" })
);

// 2. List Deals
app.openapi(
    {
        method: "get",
        path: "/deals",
        summary: "List Deals",
        security: [{ apiKeyAuth: [] }],
        request: {
            query: z.object({
                limit: z.string().optional().openapi({ example: "50" }),
                offset: z.string().optional().openapi({ example: "0" }),
            }),
        },
        responses: {
            200: {
                description: "List of deals",
                content: { "application/json": { schema: z.array(DealSchema) } },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
        },
    },
    async (c) => {
        const supabase = c.get("supabase");
        const limit = parseInt(c.req.query("limit") || "50");
        const offset = parseInt(c.req.query("offset") || "0");

        const { data, error } = await supabase
            .from("cards")
            .select("id, titulo, valor_estimado, pipeline_stage_id, created_at")
            .range(offset, offset + limit - 1);

        if (error) return c.json({ error: error.message }, 500);
        return c.json(data);
    }
);

// 3. Create Deal
app.openapi(
    {
        method: "post",
        path: "/deals",
        summary: "Create Deal",
        security: [{ apiKeyAuth: [] }],
        request: {
            body: {
                content: { "application/json": { schema: CreateDealSchema } },
            },
        },
        responses: {
            201: {
                description: "Deal created",
                content: { "application/json": { schema: DealSchema } },
            },
        },
    },
    async (c) => {
        const supabase = c.get("supabase");
        const body = await c.req.json();

        const { data, error } = await supabase
            .from("cards")
            .insert(body)
            .select()
            .single();

        if (error) return c.json({ error: error.message }, 400);
        return c.json(data, 201);
    }
);

// 4. Create Deal from Echo (button click)
app.openapi(
    {
        method: "post",
        path: "/deals/echo",
        summary: "Create Deal from Echo",
        description: "Receives Echo button-click webhook, deduplicates contact/card, and creates a new deal.",
        security: [{ apiKeyAuth: [] }],
        request: {
            body: {
                content: { "application/json": { schema: EchoWebhookSchema } },
            },
        },
        responses: {
            201: {
                description: "Deal created",
                content: { "application/json": { schema: EchoDealResponseSchema } },
            },
            409: {
                description: "Duplicate — active deal already exists for this contact",
                content: { "application/json": { schema: z.object({ id: z.string(), titulo: z.string(), dedup: z.literal(true) }) } },
            },
            400: { description: "Invalid payload", content: { "application/json": { schema: ErrorSchema } } },
            422: { description: "Phone line not configured", content: { "application/json": { schema: ErrorSchema } } },
        },
    },
    async (c) => {
        const supabase = c.get("supabase");
        const body = await c.req.json();

        // --- Step 1: Validate ---
        const parsed = EchoWebhookSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: `Payload inválido: ${parsed.error.issues.map(i => i.message).join(', ')}` }, 400);
        }
        const { contact, agent, phone_number, timestamp } = parsed.data;

        // --- Step 2: Resolve produto/pipeline via whatsapp_linha_config ---
        const { data: linhaRows } = await supabase
            .from("whatsapp_linha_config")
            .select("produto, pipeline_id, stage_id, criar_card, criar_contato, phone_number_label, default_owner_id")
            .or(`phone_number_id.eq.${phone_number.id},phone_number_label.eq.${phone_number.display_name || ''}`)
            .limit(1);

        const linha = linhaRows?.[0] ?? null;

        if (linha?.criar_card === false) {
            return c.json({ error: `Criação de card desabilitada para a linha "${linha.phone_number_label}"` }, 422);
        }

        const produto = linha?.produto || 'TRIPS';
        const pipelineId = linha?.pipeline_id || PIPELINE_MAP[produto] || PIPELINE_MAP.TRIPS;

        // Resolve stage: use linha config, or find first stage of pipeline
        let stageId = linha?.stage_id || null;
        if (!stageId) {
            const { data: stages } = await supabase
                .from("pipeline_stages")
                .select("id, pipeline_phases!inner(order_index)")
                .eq("pipeline_id", pipelineId)
                .order("pipeline_phases(order_index)", { ascending: true })
                .order("ordem", { ascending: true })
                .limit(1);
            stageId = stages?.[0]?.id || null;
        }

        // --- Step 3: Resolve owner (agent) ---
        // default_owner_id da linha tem prioridade (ex: Mariana Volpi sempre como TP)
        let ownerId: string | null = linha?.default_owner_id || null;
        if (!ownerId && agent?.email) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("id")
                .eq("email", agent.email)
                .limit(1)
                .single();
            ownerId = profile?.id || null;
        }

        // --- Step 4: Contact dedup ---
        let contactId: string | null = null;
        let contactCreated = false;

        // 4a. Try find_contact_by_whatsapp (phone + conversation_id)
        const { data: foundContactId } = await supabase
            .rpc("find_contact_by_whatsapp", { p_phone: contact.phone, p_convo_id: contact.id });

        if (foundContactId) {
            contactId = foundContactId;
        }

        // 4b. Not found — create contact
        if (!contactId) {
            if (linha?.criar_contato === false) {
                return c.json({ error: `Criação de contato desabilitada para a linha "${linha.phone_number_label}"` }, 422);
            }

            const nameParts = contact.name.trim().split(/\s+/);
            const nome = nameParts[0];
            const sobrenome = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

            const { data: newContact, error: contactErr } = await supabase
                .from("contatos")
                .insert({
                    nome,
                    sobrenome,
                    telefone: contact.phone,
                    tipo_pessoa: 'adulto',
                    origem: 'echo',
                    last_whatsapp_conversation_id: contact.id,
                })
                .select("id")
                .single();

            if (contactErr) {
                return c.json({ error: `Erro ao criar contato: ${contactErr.message}` }, 400);
            }

            contactId = newContact.id;
            contactCreated = true;

            // Insert contato_meios for phone lookup
            await supabase.from("contato_meios").upsert({
                contato_id: contactId,
                tipo: 'whatsapp',
                valor: contact.phone,
                is_principal: true,
                origem: 'echo',
            }, { onConflict: 'tipo,valor_normalizado', ignoreDuplicates: true });
        } else {
            // Update conversation link if not set
            await supabase
                .from("contatos")
                .update({ last_whatsapp_conversation_id: contact.id })
                .eq("id", contactId)
                .is("last_whatsapp_conversation_id", null);
        }

        // --- Step 5: Card dedup ---
        const { data: existingCards } = await supabase
            .from("cards")
            .select("id, titulo")
            .eq("pessoa_principal_id", contactId)
            .eq("produto", produto)
            .not("status_comercial", "in", '("ganho","perdido")')
            .is("deleted_at", null)
            .limit(1);

        if (existingCards && existingCards.length > 0) {
            return c.json({ id: existingCards[0].id, titulo: existingCards[0].titulo, dedup: true }, 409);
        }

        // --- Step 6: Create card ---
        const titulo = contact.name;
        const { data: newCard, error: cardErr } = await supabase
            .from("cards")
            .insert({
                titulo,
                pessoa_principal_id: contactId,
                pipeline_id: pipelineId,
                pipeline_stage_id: stageId,
                produto,
                origem: 'whatsapp',
                dono_atual_id: ownerId,
                sdr_owner_id: ownerId,
                status_comercial: 'aberto',
                moeda: 'BRL',
            })
            .select("id, titulo, produto, pipeline_stage_id, created_at")
            .single();

        if (cardErr) {
            return c.json({ error: `Erro ao criar card: ${cardErr.message}` }, 400);
        }

        // --- Step 7: Link contact to card ---
        await supabase.from("cards_contatos").insert({
            card_id: newCard.id,
            contato_id: contactId,
            tipo_viajante: 'adulto',
            ordem: 0,
        });

        // --- Step 8: Return ---
        return c.json({
            id: newCard.id,
            titulo: newCard.titulo,
            produto: newCard.produto,
            pipeline_stage_id: newCard.pipeline_stage_id,
            contact_id: contactId,
            contact_created: contactCreated,
            dedup: false,
            created_at: newCard.created_at,
        }, 201);
    }
);

// 5. List Contacts
app.openapi(
    {
        method: "get",
        path: "/contacts",
        summary: "List Contacts",
        security: [{ apiKeyAuth: [] }],
        request: {
            query: z.object({
                search: z.string().optional(),
                id: z.string().optional(),
                limit: z.string().optional(),
            }),
        },
        responses: {
            200: {
                description: "List of contacts",
                content: { "application/json": { schema: z.array(ContactDetailSchema) } },
            },
        },
    },
    async (c) => {
        const supabase = c.get("supabase");
        const search = c.req.query("search");
        const id = c.req.query("id");
        const limit = parseInt(c.req.query("limit") || "50");

        let query = supabase.from("contatos").select(`
            id, nome, email, telefone, last_whatsapp_conversation_id,
            whatsapp_conversations(id, status, unread_count, last_message_at, external_conversation_id),
            cards!cards_pessoa_principal_id_fkey(id, titulo, status_comercial, pipeline_stage_id),
            cards_contatos(
                cards(id, titulo, status_comercial, pipeline_stage_id)
            )
        `).limit(limit);

        if (id) {
            query = query.eq("id", id);
        } else if (search) {
            query = query.or(`nome.ilike.%${search}%,sobrenome.ilike.%${search}%,email.ilike.%${search}%`);
        }

        const { data, error } = await query;
        if (error) return c.json({ error: error.message }, 500);

        // Transform data to flat structure
        const enrichedData = data.map((contact: any) => {
            const directDeals = contact.cards || [];
            const associatedDeals = (contact.cards_contatos || [])
                .map((cc: any) => cc.cards)
                .filter((c: any) => c !== null); // Remove nulls if any

            // Merge and deduplicate deals by ID
            const allDeals = [...directDeals, ...associatedDeals];
            const uniqueDeals = Array.from(new Map(allDeals.map((d: any) => [d.id, d])).values());

            // Find Active Conversation UUID
            const activeConv = contact.whatsapp_conversations?.find(
                (c: any) => c.external_conversation_id === contact.last_whatsapp_conversation_id
            );

            return {
                id: contact.id,
                nome: contact.nome,
                email: contact.email,
                telefone: contact.telefone,
                last_whatsapp_conversation_id: contact.last_whatsapp_conversation_id,
                active_conversation_id: activeConv ? activeConv.id : null,
                whatsapp_conversations: contact.whatsapp_conversations || [],
                deals: uniqueDeals
            };
        });

        return c.json(enrichedData);
    }
);

// 5. Create Contact
app.openapi(
    {
        method: "post",
        path: "/contacts",
        summary: "Create Contact",
        security: [{ apiKeyAuth: [] }],
        request: {
            body: {
                content: { "application/json": { schema: CreateContactSchema } },
            },
        },
        responses: {
            201: {
                description: "Contact created",
                content: { "application/json": { schema: ContactSchema } },
            },
        },
    },
    async (c) => {
        const supabase = c.get("supabase");
        const body = await c.req.json();

        const parsed = CreateContactSchema.safeParse(body);
        if (!parsed.success) {
            const missing = parsed.error.issues.map(i => i.path.join(".")).join(", ");
            return c.json({ error: `Campos obrigatórios: nome, sobrenome, telefone. Faltando: ${missing}` }, 422);
        }

        const { data, error } = await supabase
            .from("contatos")
            .insert(parsed.data)
            .select()
            .single();

        if (error) return c.json({ error: error.message }, 400);
        return c.json(data, 201);
    }
);

// ---- Documentation ----

app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
        version: "2.0.0",
        title: "WelcomeCRM API",
        description: "Robust, auto-generated API for WelcomeCRM integrations.",
    },
    servers: [
        {
            url: "https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/public-api",
            description: "Production Server",
        },
    ],
});

app.get("/docs", swaggerUI({ url: "/functions/v1/public-api/openapi.json" }));

// ---- Start ----
Deno.serve(app.fetch);
