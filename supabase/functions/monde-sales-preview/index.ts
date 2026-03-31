import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ============================================
// Types
// ============================================

interface CrmItemData {
    id: string;
    type: 'proposal_item' | 'proposal_flight';
    item_type: string;
    title: string;
    description: string | null;
    supplier: string | null;
    price: number;
    rich_content: Record<string, unknown>;
}

interface MondeFieldMapping {
    crm_field: string;
    crm_value: string | number | null;
    monde_field: string;
    monde_value: string | number | null;
}

interface PreviewItem {
    crm: CrmItemData;
    monde_type: string;
    monde_object: Record<string, unknown>;
    field_mappings: MondeFieldMapping[];
}

// Monde API V3 payload types (validated via POST tests Feb 2026)
// NOTE: airline_tickets is silently IGNORED by the API — flights go as travel_packages
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
    hotels?: Array<Record<string, unknown>>;
    ground_transportations?: Array<Record<string, unknown>>;
    insurances?: Array<Record<string, unknown>>;
    cruises?: Array<Record<string, unknown>>;
    train_tickets?: Array<Record<string, unknown>>;
    car_rentals?: Array<Record<string, unknown>>;
    travel_packages?: Array<Record<string, unknown>>;
    // NOTE: airline_tickets intentionally excluded — silently ignored by Monde API
}

// ============================================
// Handler
// ============================================

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { cardId, proposalId } = await req.json();

        if (!cardId || !proposalId) {
            return new Response(JSON.stringify({ error: 'cardId and proposalId are required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 1. Fetch card with owner + contato via FK hints
        const { data: card, error: cardError } = await supabase
            .from('cards')
            .select(`
                id, titulo, produto,
                owner:profiles!cards_vendas_owner_id_profiles_fkey(id, nome, email),
                dono:profiles!cards_dono_atual_id_profiles_fkey(id, nome, email),
                contato:contatos!cards_pessoa_principal_id_fkey(id, nome, sobrenome, email, telefone, cpf, data_nascimento, passaporte, passaporte_validade, sexo, rg, tipo_cliente)
            `)
            .eq('id', cardId)
            .single();

        if (cardError || !card) {
            return new Response(JSON.stringify({ error: 'Card not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 1b. Fetch travelers (companions) from cards_contatos
        const { data: viajantesData } = await supabase
            .from('cards_contatos')
            .select('contato:contatos(id, nome, sobrenome, cpf, data_nascimento, passaporte)')
            .eq('card_id', cardId)
            .order('ordem');

        // 2. Fetch proposal with version
        const { data: proposal, error: proposalError } = await supabase
            .from('proposals')
            .select('id, status, accepted_at, accepted_total, active_version_id')
            .eq('id', proposalId)
            .single();

        if (proposalError || !proposal) {
            return new Response(JSON.stringify({ error: 'Proposal not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 3. Fetch proposal items via sections
        const { data: sections } = await supabase
            .from('proposal_sections')
            .select(`
                id, title, section_type,
                items:proposal_items(id, item_type, title, description, supplier, base_price, rich_content)
            `)
            .eq('version_id', proposal.active_version_id)
            .order('ordem');

        // 4. Fetch proposal flights
        const { data: flights } = await supabase
            .from('proposal_flights')
            .select('*')
            .eq('proposal_id', proposalId)
            .eq('is_selected', true)
            .order('trip_leg')
            .order('segment_order');

        // 5. Load settings
        const { data: settings } = await supabase
            .from('integration_settings')
            .select('key, value')
            .in('key', ['MONDE_CNPJ', 'MONDE_SHADOW_MODE']);

        const config = (settings || []).reduce((acc: Record<string, string>, s: { key: string; value: string }) => {
            acc[s.key] = s.value;
            return acc;
        }, {} as Record<string, string>);

        // 6. Build preview items
        const previewItems: PreviewItem[] = [];
        const allItems: CrmItemData[] = [];

        // Normalize proposal items
        for (const section of sections || []) {
            for (const item of (section as any).items || []) {
                const crmItem: CrmItemData = {
                    id: item.id,
                    type: 'proposal_item',
                    item_type: item.item_type,
                    title: item.title,
                    description: item.description,
                    supplier: item.supplier,
                    price: item.base_price || 0,
                    rich_content: item.rich_content || {},
                };
                allItems.push(crmItem);
            }
        }

        // Normalize flights
        for (const flight of flights || []) {
            const crmItem: CrmItemData = {
                id: flight.id,
                type: 'proposal_flight',
                item_type: 'flight',
                title: `${flight.origin_city || flight.origin_airport} → ${flight.destination_city || flight.destination_airport}`,
                description: flight.flight_number
                    ? `Voo ${flight.flight_number} - ${flight.airline_name || 'N/A'}`
                    : flight.airline_name || null,
                supplier: flight.airline_name || null,
                price: flight.price_total || flight.price_per_person || 0,
                rich_content: {
                    origin_airport: flight.origin_airport,
                    destination_airport: flight.destination_airport,
                    origin_city: flight.origin_city,
                    destination_city: flight.destination_city,
                    departure_datetime: flight.departure_datetime,
                    arrival_datetime: flight.arrival_datetime,
                    flight_number: flight.flight_number,
                    airline_name: flight.airline_name,
                    airline_code: flight.airline_code,
                    cabin_class: flight.cabin_class,
                },
            };
            allItems.push(crmItem);
        }

        // 7. Transform each item to Monde format with field mappings
        // Structure validated via real POST tests (Feb 2026)
        const hotels: Array<Record<string, unknown>> = [];
        const transfers: Array<Record<string, unknown>> = [];
        const insurances: Array<Record<string, unknown>> = [];
        const cruises: Array<Record<string, unknown>> = [];
        const trainTickets: Array<Record<string, unknown>> = [];
        const carRentals: Array<Record<string, unknown>> = [];
        const travelPackages: Array<Record<string, unknown>> = [];

        const saleDate = new Date().toISOString().split('T')[0];
        const contato = (card as any).contato;

        // Build passengers from all travelers on the card (payer + companions)
        const payerName = contato
            ? [contato.nome, contato.sobrenome].filter(Boolean).join(' ')
            : 'Pagante nao informado';

        const passengers: Array<{ person: { external_id: string; name: string } }> = [];
        const payerExternalId = contato?.id || crypto.randomUUID();
        passengers.push({ person: { external_id: payerExternalId, name: payerName } });

        // Add companions from cards_contatos (excluding payer to avoid duplicates)
        for (const v of (viajantesData || []) as any[]) {
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

        // Helper: build product base fields (shared by all product types)
        const makeBase = (item: CrmItemData) => ({
            external_id: item.id,
            currency: 'BRL',
            value: item.price,
            supplier: {
                external_id: crypto.randomUUID(),
                name: item.supplier || 'Nao informado',
            },
            passengers,
        });

        for (const item of allItems) {
            const rc = item.rich_content;
            const base = makeBase(item);

            switch (item.item_type) {
                case 'hotel':
                case 'accommodation': {
                    const mondeObj = {
                        ...base,
                        check_in: (rc.check_in as string) || saleDate,
                        check_out: (rc.check_out as string) || saleDate,
                        booking_number: (rc.booking_number as string) || `WC-${item.id.substring(0, 8)}`,
                        destination: (rc.city as string) || (rc.destination as string) || null,
                    };
                    hotels.push(mondeObj);
                    previewItems.push({
                        crm: item,
                        monde_type: 'hotels',
                        monde_object: mondeObj,
                        field_mappings: [
                            { crm_field: 'Fornecedor', crm_value: item.supplier, monde_field: 'supplier.name', monde_value: mondeObj.supplier.name },
                            { crm_field: 'Check-in', crm_value: rc.check_in as string, monde_field: 'check_in', monde_value: mondeObj.check_in },
                            { crm_field: 'Check-out', crm_value: rc.check_out as string, monde_field: 'check_out', monde_value: mondeObj.check_out },
                            { crm_field: 'Destino', crm_value: (rc.city as string) || null, monde_field: 'destination', monde_value: mondeObj.destination },
                            { crm_field: 'Reserva', crm_value: (rc.booking_number as string) || null, monde_field: 'booking_number', monde_value: mondeObj.booking_number },
                            { crm_field: 'Valor', crm_value: item.price, monde_field: 'value', monde_value: mondeObj.value },
                        ],
                    });
                    break;
                }

                case 'flight':
                case 'aereo': {
                    // airline_tickets is SILENTLY IGNORED by Monde API → map as travel_package
                    // destination is REQUIRED enum: "national" | "international" (validated Feb 2026)
                    const mondeObj = {
                        ...base,
                        begin_date: (rc.departure_datetime as string)?.substring(0, 10) || saleDate,
                        end_date: (rc.arrival_datetime as string)?.substring(0, 10) || null,
                        booking_number: (rc.flight_number as string) || `WC-${item.id.substring(0, 8)}`,
                        package_name: item.title || 'Passagem Aerea',
                        destination: (rc.destination as string) === 'national' ? 'national' : 'international',
                    };
                    travelPackages.push(mondeObj);
                    previewItems.push({
                        crm: item,
                        monde_type: 'travel_packages (voo)',
                        monde_object: mondeObj,
                        field_mappings: [
                            { crm_field: 'Titulo', crm_value: item.title, monde_field: 'package_name', monde_value: mondeObj.package_name },
                            { crm_field: 'Companhia', crm_value: item.supplier, monde_field: 'supplier.name', monde_value: mondeObj.supplier.name },
                            { crm_field: 'Partida', crm_value: rc.departure_datetime as string, monde_field: 'begin_date', monde_value: mondeObj.begin_date },
                            { crm_field: 'Chegada', crm_value: rc.arrival_datetime as string, monde_field: 'end_date', monde_value: mondeObj.end_date },
                            { crm_field: 'Numero Voo', crm_value: rc.flight_number as string, monde_field: 'booking_number', monde_value: mondeObj.booking_number },
                            { crm_field: 'Destino', crm_value: (rc.destination_airport as string) || (rc.destination_city as string), monde_field: 'destination', monde_value: mondeObj.destination },
                            { crm_field: 'Valor', crm_value: item.price, monde_field: 'value', monde_value: mondeObj.value },
                            { crm_field: '(Nota)', crm_value: 'Voo', monde_field: 'airline_tickets', monde_value: 'Ignorado pela API - mapeado como travel_package' },
                        ],
                    });
                    break;
                }

                case 'transfer':
                case 'ground_transportation': {
                    const mondeObj = {
                        ...base,
                        locator: (rc.locator as string) || `WC-${item.id.substring(0, 8)}`,
                        segments: [{
                            date: (rc.date as string) || saleDate,
                            origin: (rc.origin as string) || undefined,
                            destination: (rc.destination as string) || undefined,
                        }],
                    };
                    transfers.push(mondeObj);
                    previewItems.push({
                        crm: item,
                        monde_type: 'ground_transportations',
                        monde_object: mondeObj,
                        field_mappings: [
                            { crm_field: 'Fornecedor', crm_value: item.supplier, monde_field: 'supplier.name', monde_value: mondeObj.supplier.name },
                            { crm_field: 'Data', crm_value: rc.date as string, monde_field: 'segments[0].date', monde_value: mondeObj.segments[0].date },
                            { crm_field: 'Origem', crm_value: rc.origin as string, monde_field: 'segments[0].origin', monde_value: mondeObj.segments[0].origin || null },
                            { crm_field: 'Destino', crm_value: rc.destination as string, monde_field: 'segments[0].destination', monde_value: mondeObj.segments[0].destination || null },
                            { crm_field: 'Localizador', crm_value: (rc.locator as string) || null, monde_field: 'locator', monde_value: mondeObj.locator },
                            { crm_field: 'Valor', crm_value: item.price, monde_field: 'value', monde_value: mondeObj.value },
                        ],
                    });
                    break;
                }

                case 'insurance':
                case 'seguro': {
                    const mondeObj = {
                        ...base,
                        begin_date: (rc.start_date as string) || (rc.begin_date as string) || saleDate,
                        end_date: (rc.end_date as string) || null,
                        destination: (rc.destination as string) || null,
                    };
                    insurances.push(mondeObj);
                    previewItems.push({
                        crm: item,
                        monde_type: 'insurances',
                        monde_object: mondeObj,
                        field_mappings: [
                            { crm_field: 'Fornecedor', crm_value: item.supplier, monde_field: 'supplier.name', monde_value: mondeObj.supplier.name },
                            { crm_field: 'Inicio', crm_value: (rc.start_date as string) || (rc.begin_date as string), monde_field: 'begin_date', monde_value: mondeObj.begin_date },
                            { crm_field: 'Fim', crm_value: rc.end_date as string, monde_field: 'end_date', monde_value: mondeObj.end_date },
                            { crm_field: 'Destino', crm_value: (rc.destination as string) || null, monde_field: 'destination', monde_value: mondeObj.destination },
                            { crm_field: 'Valor', crm_value: item.price, monde_field: 'value', monde_value: mondeObj.value },
                        ],
                    });
                    break;
                }

                case 'cruise': {
                    const mondeObj = {
                        ...base,
                        departure_date: (rc.departure_date as string) || saleDate,
                        arrival_date: (rc.arrival_date as string) || saleDate,
                        booking_number: (rc.booking_number as string) || `WC-${item.id.substring(0, 8)}`,
                        ship_name: (rc.ship_name as string) || null,
                    };
                    cruises.push(mondeObj);
                    previewItems.push({
                        crm: item,
                        monde_type: 'cruises',
                        monde_object: mondeObj,
                        field_mappings: [
                            { crm_field: 'Companhia', crm_value: item.supplier, monde_field: 'supplier.name', monde_value: mondeObj.supplier.name },
                            { crm_field: 'Partida', crm_value: rc.departure_date as string, monde_field: 'departure_date', monde_value: mondeObj.departure_date },
                            { crm_field: 'Chegada', crm_value: rc.arrival_date as string, monde_field: 'arrival_date', monde_value: mondeObj.arrival_date },
                            { crm_field: 'Reserva', crm_value: (rc.booking_number as string) || null, monde_field: 'booking_number', monde_value: mondeObj.booking_number },
                            { crm_field: 'Navio', crm_value: (rc.ship_name as string) || null, monde_field: 'ship_name', monde_value: mondeObj.ship_name },
                            { crm_field: 'Valor', crm_value: item.price, monde_field: 'value', monde_value: mondeObj.value },
                        ],
                    });
                    break;
                }

                case 'train_ticket': {
                    const mondeObj = {
                        ...base,
                        locator: (rc.locator as string) || `WC-${item.id.substring(0, 8)}`,
                        segments: [{
                            departure_date: (rc.departure_date as string) || saleDate,
                            origin: (rc.origin as string) || undefined,
                            destination: (rc.destination as string) || undefined,
                        }],
                    };
                    trainTickets.push(mondeObj);
                    previewItems.push({
                        crm: item,
                        monde_type: 'train_tickets',
                        monde_object: mondeObj,
                        field_mappings: [
                            { crm_field: 'Companhia', crm_value: item.supplier, monde_field: 'supplier.name', monde_value: mondeObj.supplier.name },
                            { crm_field: 'Partida', crm_value: rc.departure_date as string, monde_field: 'segments[0].departure_date', monde_value: mondeObj.segments[0].departure_date },
                            { crm_field: 'Origem', crm_value: rc.origin as string, monde_field: 'segments[0].origin', monde_value: mondeObj.segments[0].origin || null },
                            { crm_field: 'Destino', crm_value: rc.destination as string, monde_field: 'segments[0].destination', monde_value: mondeObj.segments[0].destination || null },
                            { crm_field: 'Localizador', crm_value: (rc.locator as string) || null, monde_field: 'locator', monde_value: mondeObj.locator },
                            { crm_field: 'Valor', crm_value: item.price, monde_field: 'value', monde_value: mondeObj.value },
                        ],
                    });
                    break;
                }

                case 'car_rental': {
                    const mondeObj = {
                        ...base,
                        pickup_date: (rc.pickup_date as string) || saleDate,
                        dropoff_date: (rc.return_date as string) || (rc.dropoff_date as string) || null,
                        booking_number: (rc.booking_number as string) || `WC-${item.id.substring(0, 8)}`,
                        pickup_location: (rc.pickup_location as string) || null,
                        dropoff_location: (rc.return_location as string) || (rc.dropoff_location as string) || null,
                    };
                    carRentals.push(mondeObj);
                    previewItems.push({
                        crm: item,
                        monde_type: 'car_rentals',
                        monde_object: mondeObj,
                        field_mappings: [
                            { crm_field: 'Locadora', crm_value: item.supplier, monde_field: 'supplier.name', monde_value: mondeObj.supplier.name },
                            { crm_field: 'Retirada', crm_value: rc.pickup_date as string, monde_field: 'pickup_date', monde_value: mondeObj.pickup_date },
                            { crm_field: 'Devolucao', crm_value: (rc.return_date as string) || (rc.dropoff_date as string), monde_field: 'dropoff_date', monde_value: mondeObj.dropoff_date },
                            { crm_field: 'Reserva', crm_value: (rc.booking_number as string) || null, monde_field: 'booking_number', monde_value: mondeObj.booking_number },
                            { crm_field: 'Local Retirada', crm_value: rc.pickup_location as string, monde_field: 'pickup_location', monde_value: mondeObj.pickup_location },
                            { crm_field: 'Local Devolucao', crm_value: (rc.return_location as string) || (rc.dropoff_location as string), monde_field: 'dropoff_location', monde_value: mondeObj.dropoff_location },
                            { crm_field: 'Valor', crm_value: item.price, monde_field: 'value', monde_value: mondeObj.value },
                        ],
                    });
                    break;
                }

                case 'travel_package': {
                    // destination is REQUIRED enum: "national" | "international" (validated Feb 2026)
                    const mondeObj = {
                        ...base,
                        begin_date: (rc.start_date as string) || (rc.begin_date as string) || saleDate,
                        end_date: (rc.end_date as string) || null,
                        booking_number: (rc.booking_number as string) || `WC-${item.id.substring(0, 8)}`,
                        package_name: item.description || item.title,
                        destination: (rc.destination as string) === 'national' ? 'national' : 'international',
                    };
                    travelPackages.push(mondeObj);
                    previewItems.push({
                        crm: item,
                        monde_type: 'travel_packages',
                        monde_object: mondeObj,
                        field_mappings: [
                            { crm_field: 'Operadora', crm_value: item.supplier, monde_field: 'supplier.name', monde_value: mondeObj.supplier.name },
                            { crm_field: 'Inicio', crm_value: (rc.start_date as string) || (rc.begin_date as string), monde_field: 'begin_date', monde_value: mondeObj.begin_date },
                            { crm_field: 'Fim', crm_value: rc.end_date as string, monde_field: 'end_date', monde_value: mondeObj.end_date },
                            { crm_field: 'Pacote', crm_value: item.description || item.title, monde_field: 'package_name', monde_value: mondeObj.package_name },
                            { crm_field: 'Destino', crm_value: (rc.destination as string) || null, monde_field: 'destination', monde_value: mondeObj.destination },
                            { crm_field: 'Reserva', crm_value: (rc.booking_number as string) || null, monde_field: 'booking_number', monde_value: mondeObj.booking_number },
                            { crm_field: 'Valor', crm_value: item.price, monde_field: 'value', monde_value: mondeObj.value },
                        ],
                    });
                    break;
                }

                case 'experiencia':
                default: {
                    // Fallback: map unmapped types as travel_package (most flexible Monde type)
                    // destination is REQUIRED enum: "national" | "international" (validated Feb 2026)
                    const mondeObj = {
                        ...base,
                        begin_date: saleDate,
                        end_date: null,
                        booking_number: `WC-${item.id.substring(0, 8)}`,
                        package_name: item.title || item.description || 'Servico',
                        destination: 'international',
                    };
                    travelPackages.push(mondeObj);
                    previewItems.push({
                        crm: item,
                        monde_type: 'travel_packages',
                        monde_object: mondeObj,
                        field_mappings: [
                            { crm_field: 'Tipo Original', crm_value: item.item_type, monde_field: 'travel_packages', monde_value: 'Mapeado como pacote' },
                            { crm_field: 'Titulo', crm_value: item.title, monde_field: 'package_name', monde_value: mondeObj.package_name },
                            { crm_field: 'Fornecedor', crm_value: item.supplier, monde_field: 'supplier.name', monde_value: mondeObj.supplier.name },
                            { crm_field: 'Valor', crm_value: item.price, monde_field: 'value', monde_value: mondeObj.value },
                        ],
                    });
                }
            }
        }

        // 8. Build travel_agent and payer from card context
        const agent = (card as any).owner || (card as any).dono;

        const travelAgent = {
            external_id: agent?.id || crypto.randomUUID(),
            name: agent?.nome || 'Agente nao informado',
        };

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

        // 9. Build complete payload
        const payload: MondeSalePayload = {
            company_identifier: (config['MONDE_CNPJ'] || 'CNPJ_NAO_CONFIGURADO').replace(/\D/g, ''),
            sale_date: saleDate,
            // operation_id removed — Monde rejects unregistered operation IDs with 422
            travel_agent: travelAgent,
            payer: payer,
        };

        if (hotels.length > 0) payload.hotels = hotels;
        if (transfers.length > 0) payload.ground_transportations = transfers;
        if (insurances.length > 0) payload.insurances = insurances;
        if (cruises.length > 0) payload.cruises = cruises;
        if (trainTickets.length > 0) payload.train_tickets = trainTickets;
        if (carRentals.length > 0) payload.car_rentals = carRentals;
        if (travelPackages.length > 0) payload.travel_packages = travelPackages;
        // NOTE: airline_tickets intentionally excluded — silently ignored by Monde API

        // 10. Return preview
        const totalValue = allItems.reduce((sum, i) => sum + i.price, 0);

        return new Response(JSON.stringify({
            card: {
                id: card.id,
                titulo: card.titulo,
            },
            proposal: {
                id: proposal.id,
                status: proposal.status,
                accepted_at: proposal.accepted_at,
                accepted_total: proposal.accepted_total,
            },
            travel_agent: travelAgent,
            payer: {
                name: payer.name,
                cpf_cnpj: payer.cpf_cnpj,
                email: payer.email,
            },
            shadow_mode: config['MONDE_SHADOW_MODE'] === 'true',
            cnpj_configured: !!config['MONDE_CNPJ'],
            total_value: totalValue,
            items_count: allItems.length,
            items_preview: previewItems,
            full_payload: payload,
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
