/**
 * iterpec-search — Busca unificada na API Iterpec/Cangooroo.
 *
 * Suporta 4 serviços via parâmetro `mode`:
 *   - hotel:    Busca hotéis com preço real de operadora
 *   - transfer: Busca transfers com veículos e preços
 *   - tour:     Busca passeios/experiências
 *   - car:      Busca aluguel de carros
 *
 * Cache: 15 min (preços mudam frequentemente).
 * Credenciais: ITERPEC_USERNAME, ITERPEC_PASSWORD via env.
 *
 * POST /iterpec-search
 *   { mode: "hotel", criteria: { ... } }
 *   → { results: [...], token: "...", fromCache: boolean }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  getCached,
  getServiceClient,
  setCached,
} from "../_shared/provider-cache.ts";
import {
  IterpecClient,
  type HotelSearchCriteria,
  type TransferSearchCriteria,
  type TourSearchCriteria,
  type CarSearchCriteria,
  type HotelSearchResponse,
  type TransferSearchResponse,
  type TourSearchResponse,
  type CarSearchResponse,
  type IterpecHotel,
  type IterpecCar,
} from "../_shared/iterpec-client.ts";

const PROVIDER = "iterpec_cangooroo";
const CACHE_TTL_DAYS = 15 / (24 * 60); // 15 min em fração de dia

type Mode = "hotel" | "transfer" | "tour" | "car";

interface RequestBody {
  mode: Mode;
  criteria: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { mode, criteria } = body;
  if (!mode || !criteria) {
    return json({ error: "mode and criteria are required" }, 400);
  }

  const validModes: Mode[] = ["hotel", "transfer", "tour", "car"];
  if (!validModes.includes(mode)) {
    return json({ error: `Invalid mode. Use: ${validModes.join(", ")}` }, 400);
  }

  const supabase = getServiceClient();
  const cacheKey = `${mode}:${stableHash(criteria)}`;

  // Check cache
  const cached = await getCached(supabase, PROVIDER, cacheKey);
  if (cached) {
    return json({ ...(cached as Record<string, unknown>), fromCache: true });
  }

  try {
    const client = new IterpecClient();
    let result: Record<string, unknown>;

    switch (mode) {
      case "hotel":
        result = await handleHotelSearch(client, criteria as unknown as HotelSearchCriteria);
        break;
      case "transfer":
        result = await handleTransferSearch(client, criteria as unknown as TransferSearchCriteria);
        break;
      case "tour":
        result = await handleTourSearch(client, criteria as unknown as TourSearchCriteria);
        break;
      case "car":
        result = await handleCarSearch(client, criteria as unknown as CarSearchCriteria);
        break;
    }

    // Cache result
    await setCached(supabase, PROVIDER, cacheKey, result, CACHE_TTL_DAYS);

    return json({ ...result, fromCache: false });
  } catch (err) {
    console.error(`[iterpec-search] ${mode} error:`, err);
    return json({
      error: "Iterpec API error",
      message: err instanceof Error ? err.message : String(err),
    }, 502);
  }
});

// ─── Hotel ──────────────────────────────────────────────────────────────────

async function handleHotelSearch(
  client: IterpecClient,
  criteria: HotelSearchCriteria,
): Promise<Record<string, unknown>> {
  const response: HotelSearchResponse = await client.searchHotels(criteria);

  const results = (response.Hotels ?? []).map((h: IterpecHotel) => ({
    provider: PROVIDER,
    externalId: `iterpec_hotel_${h.HotelId}`,
    iterpecHotelId: h.HotelId,
    name: cleanHotelName(h.Name),
    address: h.Address,
    starRating: parseInt(h.Category) || undefined,
    lat: h.Latitude,
    lng: h.Longitude,
    rooms: (h.Rooms ?? []).filter(r => r.IsAvailable).map(r => ({
      roomId: r.Id,
      description: r.RoomDescription,
      board: r.BoardDescription,
      hasBreakfast: r.HasBreakfast,
      isNonRefundable: r.IsNonRefundable,
      price: r.TotalSellingPrice,
      pricePerRoom: r.SellingPricePerRoom,
      cancellationPolicies: r.CancellationPolicies ?? [],
    })),
    cheapestPrice: getCheapestPrice(h),
  }));

  return {
    results,
    token: response.Token,
    tokenExpires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    totalTime: response.TotalTime,
  };
}

function cleanHotelName(name: string): string {
  // Remove " (City, State, Country)" suffix from Iterpec hotel names
  return name.replace(/\s*\(.*\)\s*$/, "").trim();
}

function getCheapestPrice(hotel: IterpecHotel): { currency: string; value: number } | undefined {
  const available = (hotel.Rooms ?? []).filter(r => r.IsAvailable);
  if (available.length === 0) return undefined;
  const cheapest = available.reduce((min, r) =>
    r.TotalSellingPrice.Value < min.TotalSellingPrice.Value ? r : min
  );
  return {
    currency: cheapest.TotalSellingPrice.Currency,
    value: cheapest.TotalSellingPrice.Value,
  };
}

// ─── Transfer ───────────────────────────────────────────────────────────────

async function handleTransferSearch(
  client: IterpecClient,
  criteria: TransferSearchCriteria,
): Promise<Record<string, unknown>> {
  const response: TransferSearchResponse = await client.searchTransfers(criteria);

  const transfers = Array.isArray(response.Transfers) ? response.Transfers : [];
  const results = transfers.map(t => ({
    provider: PROVIDER,
    externalId: `iterpec_transfer_${t.TransferId}`,
    iterpecTransferId: t.TransferId,
    name: t.TransferName,
    transferType: t.TransferType,
    vehicleType: t.VehicleType,
    maxPassengers: t.MaxPassengers,
    price: t.SellingPrice,
    supplierName: t.SupplierName,
    description: t.Description,
    cancellationPolicies: t.CancellationPolicies ?? [],
  }));

  return {
    results,
    token: response.Token,
    tokenExpires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    totalTime: response.TotalTime,
  };
}

// ─── Tour ───────────────────────────────────────────────────────────────────

async function handleTourSearch(
  client: IterpecClient,
  criteria: TourSearchCriteria,
): Promise<Record<string, unknown>> {
  const response: TourSearchResponse = await client.searchTours(criteria);

  const tours = Array.isArray(response.Tours) ? response.Tours : [];
  const results = tours.map(t => ({
    provider: PROVIDER,
    externalId: `iterpec_tour_${t.TourId}`,
    iterpecTourId: t.TourId,
    name: t.TourName,
    description: t.Description,
    duration: t.Duration,
    price: t.SellingPrice,
    supplierName: t.SupplierName,
    availableDates: t.AvailableDates ?? [],
    cancellationPolicies: t.CancellationPolicies ?? [],
  }));

  return {
    results,
    token: response.Token,
    tokenExpires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    totalTime: response.TotalTime,
  };
}

// ─── Car ────────────────────────────────────────────────────────────────────

async function handleCarSearch(
  client: IterpecClient,
  criteria: CarSearchCriteria,
): Promise<Record<string, unknown>> {
  const response: CarSearchResponse = await client.searchCars(criteria);

  const cars = Array.isArray(response.Cars) ? response.Cars : [];
  const results = cars.map((c: IterpecCar) => ({
    provider: PROVIDER,
    externalId: `iterpec_car_${c.ResponseId}`,
    iterpecCarId: c.ResponseId,
    model: c.CarModel,
    category: c.Category,
    transmission: c.TransmissionType,
    airConditioning: c.AirConditioning,
    passengers: c.PassengerQuantity,
    baggage: c.BaggageQuantity,
    doors: c.NumberOfDoors,
    isAvailable: c.IsAvailable,
    imageUrl: c.UrlImages || (c.Images?.[0]),
    price: c.PriceInformation?.TotalPrice,
    rental: {
      name: c.Rental?.RentalName,
      logoUrl: c.Rental?.RentalLogoUrl,
      sippCode: c.Rental?.SippCode,
    },
    pickup: c.PickUpLocationDetail,
    dropoff: c.DropOffLocationDetail,
    features: c.Features?.PortugueseDescription || c.Features?.EnglishDescription,
    cancellationPolicies: c.CancellationPolicies ?? [],
  }));

  return {
    results,
    token: response.Token,
    tokenExpires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    totalTime: response.TotalTime,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stableHash(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/[+/=]/g, "").slice(0, 32);
}
