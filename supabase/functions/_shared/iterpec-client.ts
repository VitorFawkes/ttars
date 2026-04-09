/**
 * Iterpec/Cangooroo API Client
 *
 * Wrapper para a API REST da Iterpec. Injeta credenciais automaticamente
 * em toda request. Suporta busca de hotéis, transfers, tours e rent-a-car.
 *
 * Base URL: https://ws-iterpec.cangooroo.net
 * Auth: Username + Password no body JSON
 * Rate limit: 10 req/s
 * Token: 30 min (extensível a 24h via ReToken)
 */

const BASE_URL = "https://ws-iterpec.cangooroo.net";

const ENDPOINTS = {
  hotel: "/API/REST/Hotel.svc/Search",
  hotelConditions: "/API/REST/hotel.svc/getBookingConditions",
  transfer: "/API/REST/Transfer.svc/Search",
  transferConditions: "/API/REST/Transfer.svc/getBookingConditions",
  tour: "/API/REST/Tour.svc/Search",
  tourConditions: "/API/REST/Tour.svc/getBookingConditions",
  car: "/API/REST/RentACar.svc/Search",
  carConditions: "/API/REST/RentACar.svc/getBookingConditions",
  bookingDetail: "/API/REST/ClientBackOffice.svc/GetBookingDetail",
  bookingList: "/API/REST/ClientBackOffice.svc/GetBookingList",
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IterpecCredential {
  Username: string;
  Password: string;
}

// Hotel Search
export interface HotelSearchCriteria {
  CheckinDate: string; // YYYY-MM-DD
  NumNights: number;
  DestinationId: string;
  MainPaxCountryCodeNationality?: string;
  Currency?: string;
  ReturnHotelStaticData?: boolean;
  ReturnExtendedHotelStaticData?: boolean;
  ReturnOnRequestRooms?: boolean;
  SearchRooms: Array<{
    NumAdults: number;
    ChildAges?: number[];
    Quantity: number;
  }>;
  SearchType?: string;
  Filters?: {
    CheapestRoomOnly?: boolean;
    HidePackageRate?: boolean;
  };
}

export interface IterpecHotelRoom {
  Id: number;
  RoomDescription: string;
  BoardDescription: string;
  HasBreakfast: boolean;
  IsAvailable: boolean;
  IsNonRefundable: boolean;
  NumAdults: number;
  Quantity: number;
  TotalSellingPrice: { Currency: string; Value: number };
  SellingPricePerRoom: { Currency: string; Value: number };
  CancellationPolicies: Array<{
    StartDate: string;
    EndDate: string;
    Value: { Currency: string; Value: number };
  }>;
  MediaRoomId?: string;
  CanBook?: boolean;
}

export interface IterpecHotel {
  HotelId: number;
  Name: string;
  Address: string;
  Category: string;
  Latitude: number;
  Longitude: number;
  Rooms: IterpecHotelRoom[];
}

export interface HotelSearchResponse {
  Token: string;
  TimeSpan: string;
  TotalTime: number;
  Hotels: IterpecHotel[];
  Error?: { Message: string };
}

// Transfer Search
// NOTE: LocationCode is Int32 (numeric destination ID), NOT airport IATA code
export interface TransferSearchCriteria {
  Pickup: { LocationCode: number; LocationType: string };
  Dropoff: { LocationCode: number; LocationType: string };
  ServiceDate: string; // YYYY-MM-DD
  ServiceDateBack?: string;
  Hour: number;
  Minutes: number;
  HourBack?: number;
  MinutesBack?: number;
  NumberOfAdults: number;
  ChildrenAges?: number[];
  ServiceLanguage?: string;
}

export interface IterpecTransfer {
  TransferId: number;
  TransferName: string;
  TransferType: string;
  VehicleType: string;
  MaxPassengers: number;
  SellingPrice: { Currency: string; Value: number };
  SupplierName?: string;
  Description?: string;
  CancellationPolicies?: Array<{
    StartDate: string;
    EndDate: string;
    Value: { Currency: string; Value: number };
  }>;
}

export interface TransferSearchResponse {
  Token: string;
  TimeSpan: string;
  TotalTime: number;
  Transfers: IterpecTransfer[];
  Error?: { Message: string };
}

// Tour Search
export interface TourSearchCriteria {
  CityId: string;
  InitialServiceDate: string; // YYYY-MM-DD
  FinalServiceDate: string;
  NumberOfDays?: number;
  AdultAges?: number[];
  ChildAges?: number[];
  ServiceLanguage?: string;
}

export interface IterpecTour {
  TourId: number;
  TourName: string;
  Description?: string;
  Duration?: string;
  SellingPrice: { Currency: string; Value: number };
  AvailableDates?: string[];
  SupplierName?: string;
  CancellationPolicies?: Array<{
    StartDate: string;
    EndDate: string;
    Value: { Currency: string; Value: number };
  }>;
}

export interface TourSearchResponse {
  Token: string;
  TimeSpan: string;
  TotalTime: number;
  Tours: IterpecTour[];
  Error?: { Message: string };
}

// Rent A Car Search
export interface CarSearchCriteria {
  Pickup: {
    Date: string; // YYYY-MM-DD
    Hour: number;
    Minutes: number;
    LocationCode: string;
    LocationType: string; // Airport, City_Location, Hotel, CarRental
  };
  Dropoff: {
    Date: string;
    Hour: number;
    Minutes: number;
    LocationCode: string;
    LocationType: string;
  };
  SippCodes?: string[];
}

export interface IterpecCar {
  ResponseId: number;
  CarModel: string;
  Category: string;
  TransmissionType: string;
  AirConditioning: boolean;
  PassengerQuantity: number;
  BaggageQuantity: number;
  NumberOfDoors: number;
  IsAvailable: boolean;
  Images?: string[];
  UrlImages?: string;
  PriceInformation: {
    TotalPrice: { Currency: string; Value: number };
  };
  Rental: {
    RentalName: string;
    RentalLogoUrl?: string;
    SippCode?: string;
  };
  PickUpLocationDetail?: {
    Address: string;
    Latitude?: string;
    Longitude?: string;
  };
  DropOffLocationDetail?: {
    Address: string;
    Latitude?: string;
    Longitude?: string;
  };
  CancellationPolicies?: Array<{
    StartDate: string;
    EndDate: string;
    Value: { Currency: string; Value: number };
  }>;
  Features?: {
    PortugueseDescription?: string;
    EnglishDescription?: string;
  };
}

export interface CarSearchResponse {
  Token: string;
  TimeSpan: string;
  TotalTime: number;
  Cars: IterpecCar[];
  Error?: { Message: string };
}

// Booking
export interface BookingDetailResponse {
  BookingId: string;
  Status: string;
  Services: Array<{
    ServiceType: string;
    ServiceId: number;
    ConfirmationNumber?: string;
    Status: string;
    SupplierName?: string;
    CheckIn?: string;
    CheckOut?: string;
    Passengers?: Array<{ Name: string; Surname: string }>;
    TotalPrice?: { Currency: string; Value: number };
  }>;
  Error?: { Message: string };
}

export interface BookingListCriteria {
  BookingNumber?: string[];
  BookingStatus?: string[];
  ServiceTypes?: string[];
  InitialServiceDate?: string;
  FinalServiceDate?: string;
  IninalBookingDate?: string; // sic — typo na API
  FinalBookingDate?: string;
  PassengerName?: string;
  ExternalReference?: string;
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class IterpecClient {
  private credential: IterpecCredential;

  constructor() {
    const username = Deno.env.get("ITERPEC_USERNAME");
    const password = Deno.env.get("ITERPEC_PASSWORD");
    if (!username || !password) {
      throw new Error("Missing ITERPEC_USERNAME or ITERPEC_PASSWORD");
    }
    this.credential = { Username: username, Password: password };
  }

  async searchHotels(criteria: HotelSearchCriteria): Promise<HotelSearchResponse> {
    return this.post(ENDPOINTS.hotel, {
      Credential: this.credential,
      Criteria: {
        SearchType: "Hotel",
        MainPaxCountryCodeNationality: "BR",
        Currency: "BRL",
        ReturnHotelStaticData: true,
        ReturnOnRequestRooms: false,
        Filters: { CheapestRoomOnly: true, HidePackageRate: true },
        ...criteria,
      },
    });
  }

  async searchTransfers(criteria: TransferSearchCriteria): Promise<TransferSearchResponse> {
    return this.post(ENDPOINTS.transfer, {
      Credential: this.credential,
      Criteria: {
        ServiceLanguage: "pt_BR",
        ...criteria,
      },
    });
  }

  async searchTours(criteria: TourSearchCriteria): Promise<TourSearchResponse> {
    return this.post(ENDPOINTS.tour, {
      Credential: this.credential,
      Criteria: {
        ServiceLanguage: "pt_BR",
        ...criteria,
      },
    });
  }

  async searchCars(criteria: CarSearchCriteria): Promise<CarSearchResponse> {
    return this.post(ENDPOINTS.car, {
      Credential: this.credential,
      Criteria: criteria,
    });
  }

  async getHotelConditions(token: string, hotelId: number, roomIds: number[]) {
    return this.post(ENDPOINTS.hotelConditions, {
      Credential: this.credential,
      Token: token,
      HotelId: hotelId,
      RoomIds: roomIds,
    });
  }

  async getBookingDetail(bookingId: string): Promise<BookingDetailResponse> {
    return this.post(ENDPOINTS.bookingDetail, {
      Credential: this.credential,
      BookingId: bookingId,
    });
  }

  async getBookingList(criteria: BookingListCriteria) {
    return this.post(ENDPOINTS.bookingList, {
      Credential: this.credential,
      SearchBookingCriteria: criteria,
    });
  }

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Some Iterpec endpoints return XML errors on bad requests
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      const text = await res.text();
      throw new Error(`Iterpec ${endpoint} returned non-JSON (${res.status}): ${text.slice(0, 300)}`);
    }

    // Handle BOM that some endpoints include
    const rawText = await res.text();
    const cleanText = rawText.replace(/^\uFEFF/, "");
    const data = JSON.parse(cleanText) as T & { Error?: { Message: string } };

    if (data.Error?.Message) {
      throw new Error(`Iterpec error: ${data.Error.Message}`);
    }

    return data;
  }
}
