/**
 * iterpec-booking-status — Consulta status de reservas na Iterpec/Cangooroo.
 *
 * Modos:
 *   - detail: Busca detalhes de uma reserva específica por BookingId
 *   - list:   Lista reservas com filtros (status, datas, tipo de serviço)
 *
 * v1: Preparação para uso futuro (quando DoBooking for implementado).
 * v2: Usado pelo portal do cliente para mostrar status em tempo real.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient } from "../_shared/provider-cache.ts";
import { IterpecClient } from "../_shared/iterpec-client.ts";

interface DetailRequest {
  mode: "detail";
  bookingId: string;
}

interface ListRequest {
  mode: "list";
  bookingNumbers?: string[];
  bookingStatus?: string[];
  serviceTypes?: string[];
  startDate?: string;
  endDate?: string;
  passengerName?: string;
}

type RequestBody = DetailRequest | ListRequest;

// Status mapping from Iterpec to normalized
const STATUS_MAP: Record<string, string> = {
  Confirmed: "confirmed",
  Cancelled: "cancelled",
  Rejected: "rejected",
  TechnicalProblem: "technical_problem",
  OnRequest: "on_request",
  AwaitingPayment: "awaiting_payment",
  PendingCancellation: "pending_cancellation",
  InProgress: "in_progress",
};

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

  try {
    const client = new IterpecClient();

    if (body.mode === "detail") {
      if (!body.bookingId) return json({ error: "bookingId is required" }, 400);

      const detail = await client.getBookingDetail(body.bookingId);
      const services = (detail.Services ?? []).map(s => ({
        serviceType: s.ServiceType?.toLowerCase(),
        serviceId: s.ServiceId,
        confirmationNumber: s.ConfirmationNumber,
        status: STATUS_MAP[s.Status] ?? s.Status?.toLowerCase(),
        supplierName: s.SupplierName,
        checkIn: s.CheckIn,
        checkOut: s.CheckOut,
        passengers: s.Passengers?.map(p => `${p.Name} ${p.Surname}`) ?? [],
        price: s.TotalPrice,
      }));

      return json({
        bookingId: detail.BookingId,
        status: STATUS_MAP[detail.Status] ?? detail.Status?.toLowerCase(),
        services,
      });
    }

    if (body.mode === "list") {
      const listResult = await client.getBookingList({
        BookingNumber: body.bookingNumbers,
        BookingStatus: body.bookingStatus,
        ServiceTypes: body.serviceTypes,
        InitialServiceDate: body.startDate,
        FinalServiceDate: body.endDate,
        PassengerName: body.passengerName,
      });

      return json(listResult);
    }

    return json({ error: "Invalid mode (use 'detail' or 'list')" }, 400);
  } catch (err) {
    console.error("[iterpec-booking-status] error:", err);
    return json({
      error: "Iterpec API error",
      message: err instanceof Error ? err.message : String(err),
    }, 502);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
