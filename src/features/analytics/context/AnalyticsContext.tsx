
import React, { createContext, useContext, useMemo, useState } from 'react';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import type { AnalyticsData } from '../types';
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';

type Granularity = 'day' | 'week' | 'month';
type AnalysisMode = 'cohort' | 'activity';
export type Product = 'TRIPS' | 'WEDDING' | 'CORP';
export type StatusFilter = 'all' | 'open' | 'won' | 'lost';
export type DateReference = 'created' | 'trip';  // Data de criação ou data da viagem

interface DateRange {
    start: Date;
    end: Date;
}

export interface AnalyticsFilters {
    product: Product;
    ownerIds: string[];
    origins: string[];
    status: StatusFilter;
}

interface AnalyticsContextType {
    data: AnalyticsData;
    filteredData: AnalyticsData;
    loading: boolean;
    error: Error | null;

    // Controls
    dateRange: DateRange;
    setDateRange: (range: DateRange) => void;

    granularity: Granularity;
    setGranularity: (g: Granularity) => void;

    mode: AnalysisMode;
    setMode: (m: AnalysisMode) => void;

    dateReference: DateReference;
    setDateReference: (d: DateReference) => void;

    // Filters
    filters: AnalyticsFilters;
    setFilters: (filters: AnalyticsFilters) => void;
    updateFilter: <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => void;
    clearFilters: () => void;

    // Available options for filters
    availableOrigins: string[];
    availableOwners: { id: string; name: string }[];
}

const defaultFilters: AnalyticsFilters = {
    product: 'TRIPS',
    ownerIds: [],
    origins: [],
    status: 'all',
};

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export const AnalyticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { data, loading, error } = useAnalyticsData();

    // Default state - All time (from 2020 to today)
    const [dateRange, setDateRange] = useState<DateRange>({
        start: new Date(2020, 0, 1),
        end: new Date(),
    });

    const [granularity, setGranularity] = useState<Granularity>('week');
    const [mode, setMode] = useState<AnalysisMode>('activity');
    const [dateReference, setDateReference] = useState<DateReference>('created');
    const [filters, setFilters] = useState<AnalyticsFilters>(defaultFilters);

    // Helper to update a single filter
    const updateFilter = <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => setFilters(defaultFilters);

    // Extract available options from data
    const availableOrigins = useMemo(() => {
        const origins = new Set<string>();
        data.leads.forEach(lead => {
            if (lead.origin && lead.origin !== 'Unknown') {
                origins.add(lead.origin);
            }
        });
        return Array.from(origins).sort();
    }, [data.leads]);

    const availableOwners = useMemo(() => {
        const owners = new Map<string, string>();
        [...data.sdrs, ...data.planners].forEach(profile => {
            if (profile.id && profile.name) {
                owners.set(profile.id, profile.name);
            }
        });
        return Array.from(owners.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [data.sdrs, data.planners]);

    // Filter Logic
    const filteredData = useMemo(() => {
        let filteredLeads = [...data.leads];

        // Filter by date range using selected date reference
        if (dateRange.start && dateRange.end) {
            filteredLeads = filteredLeads.filter(lead => {
                try {
                    // Use trip start date or created date based on dateReference setting
                    const dateToCheck = dateReference === 'trip' && lead.tripStartDate
                        ? lead.tripStartDate
                        : lead.createdAt;

                    return isWithinInterval(dateToCheck, {
                        start: startOfDay(dateRange.start),
                        end: endOfDay(dateRange.end)
                    });
                } catch {
                    return true;
                }
            });
        }

        // Filter by product
        filteredLeads = filteredLeads.filter(lead => lead.product === filters.product);

        // Filter by status
        if (filters.status !== 'all') {
            filteredLeads = filteredLeads.filter(lead => lead.status === filters.status);
        }

        // Filter by origins
        if (filters.origins.length > 0) {
            filteredLeads = filteredLeads.filter(lead => filters.origins.includes(lead.origin));
        }

        // Filter by owners
        if (filters.ownerIds.length > 0) {
            filteredLeads = filteredLeads.filter(lead =>
                (lead.sdrId && filters.ownerIds.includes(lead.sdrId)) ||
                (lead.plannerId && filters.ownerIds.includes(lead.plannerId))
            );
        }

        // Filter trips based on filtered leads
        const filteredLeadIds = new Set(filteredLeads.map(l => l.id));
        const filteredTrips = data.trips.filter(trip => filteredLeadIds.has(trip.leadId));

        return {
            ...data,
            leads: filteredLeads,
            trips: filteredTrips,
        };
    }, [data, dateRange, dateReference, filters]);

    const value = {
        data,
        filteredData,
        loading,
        error,
        dateRange,
        setDateRange,
        granularity,
        setGranularity,
        mode,
        setMode,
        dateReference,
        setDateReference,
        filters,
        setFilters,
        updateFilter,
        clearFilters,
        availableOrigins,
        availableOwners,
    };

    return (
        <AnalyticsContext.Provider value={value}>
            {children}
        </AnalyticsContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAnalytics = () => {
    const context = useContext(AnalyticsContext);
    if (!context) {
        throw new Error('useAnalytics must be used within an AnalyticsProvider');
    }
    return context;
};
