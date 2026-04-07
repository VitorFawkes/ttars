/**
 * Tipos compartilhados pela camada de Providers de enriquecimento.
 *
 * IMPORTANTE: Esta camada é puramente leitura/lookup. Nenhum método aqui
 * deve permitir reservar, cotar ou comprar. O builder de propostas usa
 * esses dados apenas para preencher a proposta com fotos, descrições e
 * informações estruturadas. A reserva real continua acontecendo fora do
 * sistema (operador fecha com fornecedor).
 */

// ---------- HOTÉIS ----------

export interface PhotoRef {
    /** URL em alta resolução, pronta para download/exibição */
    url: string;
    /** URL de thumbnail (≤ 400px de largura, ideal para grids) */
    thumbnailUrl?: string;
    /** Largura em pixels da imagem original, se disponível */
    width?: number;
    /** Altura em pixels da imagem original, se disponível */
    height?: number;
    /** Texto alternativo (acessibilidade), quando o provider expõe */
    alt?: string;
    /** Seção da galeria do provider ("At a glance", "Bedroom", etc) */
    section?: string;
    /** HTML de atribuição obrigatório (Google/TripAdvisor exigem) */
    htmlAttribution?: string;
}

export interface HotelSummary {
    /** ID do hotel no provider de origem (ex: SerpAPI property_token) */
    externalId: string;
    /** Nome de exibição */
    name: string;
    /** Endereço resumido */
    address?: string;
    /** Cidade */
    city?: string;
    /** País (ISO-2 quando disponível) */
    country?: string;
    /** Latitude/longitude */
    lat?: number;
    lng?: number;
    /** Estrelas oficiais (1-5), quando disponível */
    starRating?: number;
    /** Nota média de hóspedes (0-10 ou 0-5 dependendo do provider — normalizar 0-5) */
    guestRating?: number;
    /** Quantidade de avaliações */
    reviewsCount?: number;
    /** Foto principal para preview do resultado de busca */
    thumbnailUrl?: string;
    /** Nome do provider que originou o resultado (para debugging/atribuição) */
    provider: HotelProviderName;
}

export interface HotelDetails extends HotelSummary {
    /** Descrição longa do hotel */
    description?: string;
    /** Lista de amenidades reconhecidas (ex: ["wifi", "pool", "spa"]) */
    amenities?: string[];
    /** Telefone */
    phone?: string;
    /** Site oficial */
    website?: string;
    /** Faixa de preço típica em USD (referencial, não para venda) */
    priceRangeUsd?: { min: number; max: number };
    /** Galeria principal (≥ 1 foto, ordenada por relevância) */
    photos: PhotoRef[];
    /** Reviews resumidas (até 5 mais relevantes), opcional */
    topReviews?: HotelReview[];
    /** Quando esse payload foi sincronizado da fonte */
    fetchedAt: string;
}

export interface HotelReview {
    author?: string;
    rating?: number;
    text?: string;
    publishedAt?: string;
    source: HotelProviderName;
}

export type HotelProviderName = 'serpapi_google_hotels' | 'tripadvisor' | 'google_places';

export interface HotelProvider {
    readonly name: HotelProviderName;
    /** Busca por nome livre. Retorna até ~10 resultados sumarizados. */
    search(query: string, opts?: HotelSearchOpts): Promise<HotelSummary[]>;
    /** Detalhes completos a partir do externalId retornado pelo search. */
    getDetails(externalId: string): Promise<HotelDetails>;
}

export interface HotelSearchOpts {
    /** ISO-2 country code para refinar resultados (ex: "BR") */
    country?: string;
    /** Cidade para refinar (texto livre) */
    city?: string;
    /** Idioma de retorno (ex: "pt-BR") */
    language?: string;
}

// ---------- VOOS ----------

export interface FlightDetails {
    /** Código IATA do voo já formatado (ex: "LA8084") */
    flightNumber: string;
    /** Data de partida no formato YYYY-MM-DD (timezone do aeroporto de origem) */
    departureDate: string;
    /** Companhia aérea */
    airline: {
        iata: string;
        name: string;
        /** URL do logo, quando o provider expõe */
        logoUrl?: string;
    };
    /** Aeroporto de origem */
    departure: AirportPoint;
    /** Aeroporto de destino */
    arrival: AirportPoint;
    /** Duração total em minutos (incluindo escalas) */
    durationMinutes?: number;
    /** Tipo de aeronave (ex: "Boeing 787-9") */
    aircraft?: string;
    /** Status (scheduled, departed, arrived, cancelled, etc) */
    status?: string;
    /** Provider que originou esse payload */
    provider: FlightProviderName;
    /** Quando esse payload foi sincronizado da fonte */
    fetchedAt: string;
}

export interface AirportPoint {
    /** Código IATA do aeroporto (ex: "GRU") */
    iata: string;
    /** Nome completo (ex: "São Paulo / Guarulhos International") */
    name?: string;
    /** Cidade */
    city?: string;
    /** País */
    country?: string;
    /** Horário programado (ISO 8601 com timezone) */
    scheduledTime?: string;
    /** Terminal */
    terminal?: string;
    /** Portão */
    gate?: string;
}

export type FlightProviderName = 'aerodatabox' | 'aviationstack';

export interface FlightProvider {
    readonly name: FlightProviderName;
    /**
     * Lookup por número de voo + data de partida.
     * Retorna null quando o voo não é encontrado (não lança).
     * Lança apenas em erros transitórios (rede, rate limit, payload inválido).
     */
    byFlightNumber(flightNumber: string, departureDate: string): Promise<FlightDetails | null>;
}

// ---------- ERROS ----------

export class ProviderError extends Error {
    readonly provider: string;
    readonly code: 'rate_limit' | 'not_found' | 'auth' | 'network' | 'parse' | 'unknown';
    readonly providerCause?: unknown;

    constructor(
        message: string,
        provider: string,
        code: 'rate_limit' | 'not_found' | 'auth' | 'network' | 'parse' | 'unknown',
        cause?: unknown,
    ) {
        super(message);
        this.name = 'ProviderError';
        this.provider = provider;
        this.code = code;
        this.providerCause = cause;
    }
}
