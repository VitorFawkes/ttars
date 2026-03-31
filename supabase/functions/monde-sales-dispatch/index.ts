import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// --- Types matching Monde API V3 (validated via POST tests Feb 2026) ---

interface MondeSale {
    id: string;
    card_id: string;
    proposal_id: string | null;
    sale_date: string;
    travel_start_date: string | null;
    travel_end_date: string | null;
    total_value: number;
    idempotency_key: string;
    status: string;
    attempts: number;
    max_attempts: number;
    cards?: {
        id: string;
        titulo: string;
        produto_data: Record<string, unknown> | null;
        pessoa_principal_id?: string;
        receita?: number | null;
        contato?: {
            id: string; nome: string; sobrenome: string; email: string; telefone: string; cpf: string;
            data_nascimento?: string | null; passaporte?: string | null; passaporte_validade?: string | null;
            sexo?: string | null; rg?: string | null; tipo_cliente?: string | null;
        } | null;
        owner?: { id: string; nome: string; email: string } | null;
        dono?: { id: string; nome: string; email: string } | null;
        viajantes?: Array<{
            contato: { id: string; nome: string; sobrenome: string; cpf?: string | null; data_nascimento?: string | null; passaporte?: string | null } | null;
        }>;
    };
}

interface MondeSaleItem {
    id: string;
    sale_id: string;
    item_type: string;
    title: string;
    description: string | null;
    supplier: string | null;
    unit_price: number;
    quantity: number;
    total_price: number;
    service_date_start: string | null;
    service_date_end: string | null;
    item_metadata: Record<string, unknown>;
}

// Monde API V3 — Real structure (validated via POST tests Feb 2026)
// IMPORTANT: airline_tickets is SILENTLY IGNORED by the API — flights go as travel_packages

interface MondeSupplier {
    external_id: string;
    name: string;
}

interface MondePassenger {
    person: {
        external_id: string;
        name: string;
    };
    amount?: number;
    agency_fee?: number;
}

interface MondeProductBase {
    external_id: string;
    currency: string;
    value: number;
    supplier: MondeSupplier;
    passengers: MondePassenger[];
    commission_amount?: number;
}

interface MondeHotel extends MondeProductBase {
    check_in: string;
    check_out: string;
    booking_number: string;
    destination?: string | null;
    accommodation_kind?: string | null;
    room_category?: string | null;
    meal_plan?: string | null;
    exchange_rate?: number;
}

interface MondeInsurance extends MondeProductBase {
    begin_date: string;
    end_date?: string | null;
    voucher_code?: string | null;
    destination?: string | null;
}

interface MondeCruise extends MondeProductBase {
    departure_date: string;
    arrival_date: string;
    booking_number: string;
    ship_name?: string | null;
}

interface MondeGroundTransportation extends MondeProductBase {
    locator: string;
    segments?: Array<{ date: string; origin?: string; destination?: string }>;
}

interface MondeTrainTicket extends MondeProductBase {
    locator: string;
    segments?: Array<{ departure_date: string; origin?: string; destination?: string }>;
}

interface MondeCarRental extends MondeProductBase {
    pickup_date: string;
    dropoff_date?: string;
    booking_number: string;
    pickup_location?: string | null;
    dropoff_location?: string | null;
}

interface MondeTravelPackage extends MondeProductBase {
    begin_date: string;
    end_date?: string | null;
    booking_number: string;
    package_name?: string;
    destination?: string | null;
}

interface MondeSalePayload {
    company_identifier: string;
    sale_date: string;
    operation_id?: string;
    travel_agent: {
        external_id: string;
        name: string;
        cpf?: string;
    };
    payer: {
        person_kind: 'individual' | 'company';
        external_id: string;
        name: string;
        cpf_cnpj?: string;
        email?: string;
        mobile_number?: string;
        birthdate?: string;
        gender?: string;
        passport_number?: string;
        passport_expiration_date?: string;
        rg_ie?: string;
    };
    hotels?: MondeHotel[];
    insurances?: MondeInsurance[];
    cruises?: MondeCruise[];
    ground_transportations?: MondeGroundTransportation[];
    train_tickets?: MondeTrainTicket[];
    car_rentals?: MondeCarRental[];
    travel_packages?: MondeTravelPackage[];
    // NOTE: airline_tickets intentionally excluded — silently ignored by Monde API
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[monde-sales-dispatch] Starting dispatch processing...');

    // 1. Load settings
    const { data: settings } = await supabase
        .from('integration_settings')
        .select('key, value')
        .in('key', ['MONDE_API_URL', 'MONDE_SHADOW_MODE', 'MONDE_CNPJ', 'MONDE_ENVIRONMENT']);

    const config = (settings || []).reduce((acc, s) => {
        acc[s.key] = s.value;
        return acc;
    }, {} as Record<string, string>);

    const shadowMode = config['MONDE_SHADOW_MODE'] === 'true';
    const mondeUrl = config['MONDE_API_URL'] || 'https://web.monde.com.br/api/v3';
    const mondeCnpj = config['MONDE_CNPJ'];

    // Load credentials from environment (secrets)
    const mondeUsername = Deno.env.get('MONDE_USERNAME');
    const mondePassword = Deno.env.get('MONDE_PASSWORD');

    if (!shadowMode && (!mondeUsername || !mondePassword)) {
        console.error('[monde-sales-dispatch] Missing Monde credentials');
        return new Response(JSON.stringify({
            error: 'Monde credentials not configured',
            details: 'Set MONDE_USERNAME and MONDE_PASSWORD secrets'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (!mondeCnpj && !shadowMode) {
        console.error('[monde-sales-dispatch] Missing MONDE_CNPJ');
        return new Response(JSON.stringify({
            error: 'MONDE_CNPJ not configured',
            details: 'Set MONDE_CNPJ in integration_settings'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // 2. Fetch pending sales with card context (contato, owner for payer/agent)
    const now = new Date().toISOString();
    const { data: sales, error: fetchError } = await supabase
        .from('monde_sales')
        .select(`
            id, card_id, proposal_id, sale_date, travel_start_date, travel_end_date,
            total_value, idempotency_key, status, attempts, max_attempts,
            cards:cards(
                id, titulo, produto_data, pessoa_principal_id, receita,
                contato:contatos!cards_pessoa_principal_id_fkey(id, nome, sobrenome, email, telefone, cpf, data_nascimento, passaporte, passaporte_validade, sexo, rg, tipo_cliente),
                owner:profiles!cards_vendas_owner_id_profiles_fkey(id, nome, email),
                dono:profiles!cards_dono_atual_id_profiles_fkey(id, nome, email),
                viajantes:cards_contatos(contato:contatos(id, nome, sobrenome, cpf, data_nascimento, passaporte))
            )
        `)
        .eq('status', 'pending')
        .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
        .order('created_at')
        .limit(50);

    if (fetchError) {
        console.error('[monde-sales-dispatch] Failed to fetch sales:', fetchError);
        return new Response(JSON.stringify({ error: fetchError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (!sales?.length) {
        console.log('[monde-sales-dispatch] No pending sales');
        return new Response(JSON.stringify({
            message: 'No pending sales',
            processed: 0,
            shadow_mode: shadowMode
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    console.log(`[monde-sales-dispatch] Processing ${sales.length} sales (shadow=${shadowMode})...`);

    const results: Array<{ id: string; status: string; monde_sale_id?: string; error?: string }> = [];

    for (const sale of sales as unknown as MondeSale[]) {
        try {
            // Mark as processing
            await supabase
                .from('monde_sales')
                .update({ status: 'processing' })
                .eq('id', sale.id);

            // Fetch sale items
            const { data: items } = await supabase
                .from('monde_sale_items')
                .select('*')
                .eq('sale_id', sale.id);

            const saleItems = (items || []) as MondeSaleItem[];

            // Validate: API requires at least 1 product
            if (saleItems.length === 0) {
                await supabase
                    .from('monde_sales')
                    .update({
                        status: 'failed',
                        error_message: 'Nenhum item de venda encontrado. A API Monde exige pelo menos 1 produto.',
                        attempts: sale.attempts + 1,
                    })
                    .eq('id', sale.id);
                results.push({ id: sale.id, status: 'failed', error: 'No sale items' });
                console.error(`[monde-sales-dispatch] ✗ Sale ${sale.id} has no items — skipping`);
                continue;
            }

            // Build Monde payload
            const payload = buildMondePayload(sale, saleItems, mondeCnpj || '00000000000000');

            if (shadowMode) {
                // Shadow mode - log only
                console.log(`[monde-sales-dispatch] [SHADOW] Would POST to Monde:`, JSON.stringify(payload, null, 2));

                await supabase
                    .from('monde_sales')
                    .update({
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                        monde_sale_id: `SHADOW-${Date.now()}`,
                        monde_response: { shadow: true, payload },
                        attempts_log: [
                            ...(Array.isArray(sale.attempts) ? sale.attempts : []),
                            { timestamp: new Date().toISOString(), status: 'shadow_success' }
                        ]
                    })
                    .eq('id', sale.id);

                results.push({ id: sale.id, status: 'sent_shadow', monde_sale_id: `SHADOW-${Date.now()}` });
                console.log(`[monde-sales-dispatch] [SHADOW] Sale ${sale.id} simulated successfully`);
                continue;
            }

            // Real dispatch to Monde API
            const startTime = Date.now();
            const response = await fetch(`${mondeUrl}/sales`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${btoa(`${mondeUsername}:${mondePassword}`)}`,
                    'Idempotency-Key': sale.idempotency_key
                },
                body: JSON.stringify(payload)
            });

            const durationMs = Date.now() - startTime;
            const responseBody = await response.json().catch(() => ({}));

            // Log attempt
            const attemptLog = {
                timestamp: new Date().toISOString(),
                attempt: sale.attempts + 1,
                http_status: response.status,
                duration_ms: durationMs,
                response: responseBody
            };

            if (response.ok) {
                // Success
                const mondeSaleId = responseBody.sale_id || responseBody.id;

                await supabase
                    .from('monde_sales')
                    .update({
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                        monde_sale_id: mondeSaleId,
                        monde_sale_number: responseBody.sale_number,
                        monde_response: responseBody,
                        attempts: sale.attempts + 1,
                        attempts_log: [...(Array.isArray(sale.attempts) ? sale.attempts : []), attemptLog]
                    })
                    .eq('id', sale.id);

                // Sync numero_venda_monde to card.produto_data for compatibility
                // with global search, CSV import, sub-card merge, and TripInformation display
                const saleNumber = responseBody.sale_number?.toString();
                if (saleNumber && sale.card_id) {
                    try {
                        const { data: currentCard } = await supabase
                            .from('cards')
                            .select('produto_data')
                            .eq('id', sale.card_id)
                            .single();

                        const produtoData = (currentCard?.produto_data || {}) as Record<string, unknown>;
                        await supabase
                            .from('cards')
                            .update({
                                produto_data: {
                                    ...produtoData,
                                    numero_venda_monde: saleNumber,
                                }
                            })
                            .eq('id', sale.card_id);
                        console.log(`[monde-sales-dispatch] Synced numero_venda_monde=${saleNumber} to card ${sale.card_id}`);
                    } catch (syncErr) {
                        console.error(`[monde-sales-dispatch] Failed to sync numero_venda_monde:`, syncErr);
                        // Non-blocking — sale was sent successfully
                    }
                }

                results.push({ id: sale.id, status: 'sent', monde_sale_id: mondeSaleId });
                console.log(`[monde-sales-dispatch] ✓ Sale ${sale.id} sent successfully, Monde ID: ${mondeSaleId}`);

            } else {
                // Handle error
                const newAttempts = sale.attempts + 1;
                const isRetryable = [408, 409, 429, 500, 502, 503, 504].includes(response.status);
                const shouldRetry = isRetryable && newAttempts < sale.max_attempts;

                if (shouldRetry) {
                    // Schedule retry with exponential backoff
                    const delayMs = 60000 * Math.pow(2, newAttempts - 1); // 1min, 2min, 4min...

                    await supabase
                        .from('monde_sales')
                        .update({
                            status: 'pending',
                            attempts: newAttempts,
                            next_retry_at: new Date(Date.now() + delayMs).toISOString(),
                            error_message: `HTTP ${response.status}: ${JSON.stringify(responseBody)}`,
                            attempts_log: [...(Array.isArray(sale.attempts) ? sale.attempts : []), attemptLog]
                        })
                        .eq('id', sale.id);

                    results.push({ id: sale.id, status: 'retry_scheduled', error: `HTTP ${response.status}` });
                    console.log(`[monde-sales-dispatch] Sale ${sale.id} scheduled for retry (attempt ${newAttempts})`);

                } else {
                    // Final failure
                    await supabase
                        .from('monde_sales')
                        .update({
                            status: 'failed',
                            attempts: newAttempts,
                            error_message: `HTTP ${response.status}: ${JSON.stringify(responseBody)}`,
                            attempts_log: [...(Array.isArray(sale.attempts) ? sale.attempts : []), attemptLog]
                        })
                        .eq('id', sale.id);

                    results.push({ id: sale.id, status: 'failed', error: `HTTP ${response.status}` });
                    console.error(`[monde-sales-dispatch] ✗ Sale ${sale.id} failed definitively: HTTP ${response.status}`);
                }
            }

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[monde-sales-dispatch] ✗ Sale ${sale.id} error:`, errorMessage);

            // Mark as failed on exception
            await supabase
                .from('monde_sales')
                .update({
                    status: 'failed',
                    attempts: sale.attempts + 1,
                    error_message: errorMessage,
                    attempts_log: [
                        ...(Array.isArray(sale.attempts) ? sale.attempts : []),
                        { timestamp: new Date().toISOString(), error: errorMessage }
                    ]
                })
                .eq('id', sale.id);

            results.push({ id: sale.id, status: 'error', error: errorMessage });
        }
    }

    const successCount = results.filter(r => r.status === 'sent' || r.status === 'sent_shadow').length;
    const failCount = results.filter(r => r.status === 'failed' || r.status === 'error').length;
    const retryCount = results.filter(r => r.status === 'retry_scheduled').length;

    console.log(`[monde-sales-dispatch] Complete: ${successCount} sent, ${failCount} failed, ${retryCount} retry`);

    return new Response(JSON.stringify({
        processed: results.length,
        sent: successCount,
        failed: failCount,
        retry_scheduled: retryCount,
        shadow_mode: shadowMode,
        results
    }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
});

/**
 * Build Monde API V3 payload from sale and items.
 * Structure validated via real POST tests (Feb 2026, sales 69160/69161).
 * Key differences from original docs:
 *   - supplier is an OBJECT { external_id, name }, not a string
 *   - passengers[] is REQUIRED on every product
 *   - external_id, currency, booking_number are REQUIRED
 *   - airline_tickets is silently IGNORED — flights go as travel_packages
 *   - commission_amount sends receita to Monde
 */
function buildMondePayload(
    sale: MondeSale,
    items: MondeSaleItem[],
    cnpj: string
): MondeSalePayload {
    const card = sale.cards;
    const agent = card?.owner || card?.dono;
    const contato = card?.contato;

    // travel_agent (REQUIRED)
    const travelAgent = {
        external_id: agent?.id || crypto.randomUUID(),
        name: agent?.nome || 'Agente não informado',
    };

    // payer (REQUIRED) — enriched with all available contact data
    const payerName = contato
        ? [contato.nome, contato.sobrenome].filter(Boolean).join(' ')
        : 'Pagante não informado';

    // Map tipo_cliente to Monde person_kind
    const personKind: 'individual' | 'company' = contato?.tipo_cliente === 'PJ' ? 'company' : 'individual';

    // Map sexo to Monde gender
    const gender = contato?.sexo === 'masculino' ? 'male'
        : contato?.sexo === 'feminino' ? 'female'
        : undefined;

    const payer = {
        person_kind: personKind,
        external_id: contato?.id || crypto.randomUUID(),
        name: payerName,
        cpf_cnpj: contato?.cpf?.replace(/\D/g, '') || undefined,
        email: contato?.email || undefined,
        mobile_number: contato?.telefone?.replace(/\D/g, '') || undefined,
        birthdate: contato?.data_nascimento || undefined,
        gender,
        passport_number: contato?.passaporte || undefined,
        passport_expiration_date: contato?.passaporte_validade || undefined,
        rg_ie: contato?.rg || undefined,
    };

    // Build passengers from all travelers on the card (payer + companions)
    const passengers: MondePassenger[] = [];
    const payerExternalId = contato?.id || crypto.randomUUID();
    passengers.push({
        person: { external_id: payerExternalId, name: payerName },
    });

    // Add companions from cards_contatos (excluding payer to avoid duplicates)
    for (const v of card?.viajantes || []) {
        const vc = v.contato;
        if (vc && vc.id !== contato?.id) {
            passengers.push({
                person: {
                    external_id: vc.id,
                    name: [vc.nome, vc.sobrenome].filter(Boolean).join(' '),
                },
            });
        }
    }

    // Receita: distribute commission_amount proportionally across items
    const cardReceita = card?.receita as number | null | undefined;
    const totalValue = items.reduce((sum, i) => sum + i.total_price, 0);

    // Helper: build product base fields (shared by all product types)
    const makeBase = (item: MondeSaleItem): MondeProductBase => {
        const supplierName = item.supplier || 'Não informado';
        const commission = cardReceita && totalValue > 0
            ? Math.round((item.total_price / totalValue) * cardReceita * 100) / 100
            : undefined;

        return {
            external_id: item.id,
            currency: 'BRL',
            value: item.total_price,
            supplier: {
                external_id: crypto.randomUUID(),
                name: supplierName,
            },
            passengers,
            ...(commission ? { commission_amount: commission } : {}),
        };
    };

    // Travel dates fallback: travel_start/end_date → sale_date
    const travelStart = sale.travel_start_date || sale.sale_date;
    const travelEnd = sale.travel_end_date || travelStart;

    // Product arrays
    const hotels: MondeHotel[] = [];
    const insurances: MondeInsurance[] = [];
    const cruises: MondeCruise[] = [];
    const groundTransportations: MondeGroundTransportation[] = [];
    const trainTickets: MondeTrainTicket[] = [];
    const carRentals: MondeCarRental[] = [];
    const travelPackages: MondeTravelPackage[] = [];

    for (const item of items) {
        const meta = item.item_metadata || {};
        const base = makeBase(item);

        switch (item.item_type) {
            case 'hotel':
            case 'accommodation':
                hotels.push({
                    ...base,
                    check_in: (meta.check_in as string) || travelStart,
                    check_out: (meta.check_out as string) || travelEnd,
                    booking_number: (meta.booking_number as string) || `WC-${item.id.substring(0, 8)}`,
                    destination: (meta.city as string) || (meta.destination as string) || null,
                });
                break;

            case 'flight':
            case 'aereo':
                // airline_tickets is SILENTLY IGNORED by Monde API → map as travel_package
                // destination is REQUIRED enum: "national" | "international" (validated Feb 2026)
                travelPackages.push({
                    ...base,
                    begin_date: (meta.departure_datetime as string)?.substring(0, 10) || travelStart,
                    end_date: (meta.arrival_datetime as string)?.substring(0, 10) || null,
                    booking_number: (meta.flight_number as string) || (meta.locator as string) || `WC-${item.id.substring(0, 8)}`,
                    package_name: item.title || 'Passagem Aérea',
                    destination: (meta.destination as string) === 'national' ? 'national' : 'international',
                });
                console.log(`[monde-sales-dispatch] Flight mapped to travel_package (airline_tickets ignored by API)`);
                break;

            case 'insurance':
            case 'seguro':
                insurances.push({
                    ...base,
                    begin_date: (meta.start_date as string) || (meta.begin_date as string) || travelStart,
                    end_date: (meta.end_date as string) || travelEnd,
                    destination: (meta.destination as string) || null,
                });
                break;

            case 'cruise':
                cruises.push({
                    ...base,
                    departure_date: (meta.departure_date as string) || travelStart,
                    arrival_date: (meta.arrival_date as string) || travelEnd,
                    booking_number: (meta.booking_number as string) || `WC-${item.id.substring(0, 8)}`,
                    ship_name: (meta.ship_name as string) || null,
                });
                break;

            case 'transfer':
            case 'ground_transportation':
                groundTransportations.push({
                    ...base,
                    locator: (meta.locator as string) || `WC-${item.id.substring(0, 8)}`,
                    segments: [{
                        date: (meta.date as string) || travelStart,
                        origin: (meta.origin as string) || undefined,
                        destination: (meta.destination as string) || undefined,
                    }],
                });
                break;

            case 'train_ticket':
                trainTickets.push({
                    ...base,
                    locator: (meta.locator as string) || `WC-${item.id.substring(0, 8)}`,
                    segments: [{
                        departure_date: (meta.departure_date as string) || travelStart,
                        origin: (meta.origin as string) || undefined,
                        destination: (meta.destination as string) || undefined,
                    }],
                });
                break;

            case 'car_rental':
                carRentals.push({
                    ...base,
                    pickup_date: (meta.pickup_date as string) || travelStart,
                    dropoff_date: (meta.return_date as string) || (meta.dropoff_date as string) || travelEnd,
                    booking_number: (meta.booking_number as string) || `WC-${item.id.substring(0, 8)}`,
                    pickup_location: (meta.pickup_location as string) || null,
                    dropoff_location: (meta.return_location as string) || (meta.dropoff_location as string) || null,
                });
                break;

            case 'travel_package':
            case 'experiencia':
            default:
                // Fallback: everything maps to travel_package (most flexible Monde type)
                // destination is REQUIRED enum: "national" | "international" (validated Feb 2026)
                travelPackages.push({
                    ...base,
                    begin_date: (meta.start_date as string) || (meta.begin_date as string) || travelStart,
                    end_date: (meta.end_date as string) || travelEnd,
                    booking_number: (meta.booking_number as string) || `WC-${item.id.substring(0, 8)}`,
                    package_name: item.title || item.description || 'Serviço',
                    destination: (meta.destination as string) === 'national' ? 'national' : 'international',
                });
                if (item.item_type !== 'travel_package') {
                    console.log(`[monde-sales-dispatch] Item type '${item.item_type}' mapped to travel_package`);
                }
                break;
        }
    }

    const payload: MondeSalePayload = {
        company_identifier: cnpj.replace(/\D/g, ''),
        sale_date: sale.sale_date,
        // operation_id removed — Monde rejects unregistered operation IDs with 422
        travel_agent: travelAgent,
        payer,
    };

    if (hotels.length > 0) payload.hotels = hotels;
    if (insurances.length > 0) payload.insurances = insurances;
    if (cruises.length > 0) payload.cruises = cruises;
    if (groundTransportations.length > 0) payload.ground_transportations = groundTransportations;
    if (trainTickets.length > 0) payload.train_tickets = trainTickets;
    if (carRentals.length > 0) payload.car_rentals = carRentals;
    if (travelPackages.length > 0) payload.travel_packages = travelPackages;
    // NOTE: airline_tickets intentionally excluded — silently ignored by Monde API

    return payload;
}
