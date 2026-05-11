import { z } from 'zod';

// --- Constants ---

/** ID da integração ActiveCampaign (principal do sistema) */
export const AC_INTEGRATION_ID = 'a2141b92-561f-4514-92b4-9412a068d236';

// --- Shared Types ---

export const IntegrationTypeSchema = z.enum(['input', 'output']);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

// --- Inbound Configuration (Webhook Ingest) ---

export const InboundMappingSchema = z.record(z.string(), z.string()); // CRM Field -> Payload Path
export type InboundMapping = z.infer<typeof InboundMappingSchema>;

export const InboundConfigSchema = z.object({
    mapping: InboundMappingSchema.default({}),
    // Phase 2: Data Assurance - Store full raw payload even if not all fields are mapped
    store_raw_payload: z.boolean().default(false),
});
export type InboundConfig = z.infer<typeof InboundConfigSchema>;

// --- Outbound Configuration (Webhook Dispatch) ---

export const OutboundHeaderSchema = z.object({
    key: z.string().min(1, "Key is required"),
    value: z.string(),
});

// Mode for outbound payloads
export const OutboundPayloadModeSchema = z.enum(['custom', 'full_object']);
export type OutboundPayloadMode = z.infer<typeof OutboundPayloadModeSchema>;

export const OutboundConfigSchema = z.object({
    trigger_event: z.string().min(1, "Trigger event is required"), // e.g., 'deal.moved', 'contact.created'
    trigger_conditions: z.record(z.string(), z.any()).optional(), // e.g., { pipeline_id: '...' }
    method: HttpMethodSchema.default('POST'),
    url: z.string().url("Must be a valid URL"),
    headers: z.array(OutboundHeaderSchema).default([]),
    // Phase 2: Data Assurance - Choose between custom template or full object
    payload_mode: OutboundPayloadModeSchema.default('custom'),
    body_template: z.string().optional(), // JSON string with handlebars-like syntax {{deal.id}}
});
export type OutboundConfig = z.infer<typeof OutboundConfigSchema>;

// --- Union Config ---

export const IntegrationConfigSchema = z.union([
    InboundConfigSchema,
    OutboundConfigSchema,
]);
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

// --- Helper to validate config based on type ---
export const validateConfig = (type: IntegrationType, config: unknown) => {
    if (type === 'input') {
        return InboundConfigSchema.safeParse(config);
    } else {
        return OutboundConfigSchema.safeParse(config);
    }
};
