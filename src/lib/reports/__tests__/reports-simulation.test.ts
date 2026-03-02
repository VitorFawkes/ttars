/**
 * Simulation tests for the Reports module.
 * Tests pure logic functions with real-world data scenarios.
 */
import { describe, it, expect } from 'vitest'
import { buildReportKeys, mapDrillFilters } from '../buildReportKeys'
import { formatCurrency, formatPercent, formatDays, autoFormat, formatDateAxis } from '../formatters'
import type { ReportIQR, FilterSpec } from '../reportTypes'

// ============================================================
// buildReportKeys
// ============================================================
describe('buildReportKeys', () => {
    it('should generate correct keys for simple 1-dim 1-measure', () => {
        const iqr: ReportIQR = {
            source: 'cards',
            dimensions: [{ field: 'status_comercial' }],
            measures: [{ field: 'id', aggregation: 'count' }],
            filters: [],
            limit: 50,
        }
        const result = buildReportKeys(iqr)

        expect(result.dimensionKeys).toEqual(['dim_0'])
        expect(result.measureKeys).toEqual(['mea_0'])
        expect(result.labels.dim_0).toBeDefined()
        expect(result.labels.mea_0).toBeDefined()
        expect(result.drillFieldMap.dim_0).toBe('status_comercial')
        expect(result.breakdownKey).toBeNull()
        expect(result.dateGrouping).toBeUndefined()
    })

    it('should generate correct keys for multi-dim multi-measure', () => {
        const iqr: ReportIQR = {
            source: 'cards',
            dimensions: [
                { field: 'status_comercial' },
                { field: 'created_at', dateGrouping: 'month' },
            ],
            measures: [
                { field: 'id', aggregation: 'count' },
                { field: 'valor_estimado', aggregation: 'sum' },
            ],
            filters: [],
            limit: 50,
        }
        const result = buildReportKeys(iqr)

        expect(result.dimensionKeys).toEqual(['dim_0', 'dim_1'])
        expect(result.measureKeys).toEqual(['mea_0', 'mea_1'])
        expect(result.drillFieldMap.dim_0).toBe('status_comercial')
        expect(result.drillFieldMap.dim_1).toBe('created_at')
        expect(result.dateGrouping).toBe('month')
    })

    it('should handle computedMeasures', () => {
        const iqr: ReportIQR = {
            source: 'cards',
            dimensions: [{ field: 'status_comercial' }],
            measures: [{ field: 'id', aggregation: 'count' }],
            computedMeasures: [{ type: 'computed', key: 'taxa_conversao' }],
            filters: [],
            limit: 50,
        }
        const result = buildReportKeys(iqr)

        // computedMeasures come after regular measures
        expect(result.measureKeys).toEqual(['mea_0', 'taxa_conversao'])
        expect(result.labels.taxa_conversao).toBeDefined()
    })

    it('should handle breakdownBy', () => {
        const iqr: ReportIQR = {
            source: 'cards',
            dimensions: [{ field: 'created_at', dateGrouping: 'month' }],
            measures: [{ field: 'id', aggregation: 'count' }],
            breakdownBy: { field: 'produto' },
            filters: [],
            limit: 50,
        }
        const result = buildReportKeys(iqr)

        expect(result.breakdownKey).toBe('breakdown')
        expect(result.drillFieldMap.breakdown).toBe('produto')
        expect(result.labels.breakdown).toBeDefined()
    })

    it('should generate keyFormats with currency for financial fields', () => {
        const iqr: ReportIQR = {
            source: 'cards',
            dimensions: [{ field: 'status_comercial' }],
            measures: [
                { field: 'c.valor_estimado', aggregation: 'sum' },
                { field: 'c.id', aggregation: 'count' },
            ],
            filters: [],
            limit: 50,
        }
        const result = buildReportKeys(iqr)

        // c.valor_estimado is category 'Financeiro' with sum → should be 'currency'
        expect(result.keyFormats).toBeDefined()
        expect(result.keyFormats.mea_0).toBe('currency')
        // c.id count → 'number'
        expect(result.keyFormats.mea_1).toBe('number')
    })

    it('should use alias when provided', () => {
        const iqr: ReportIQR = {
            source: 'cards',
            dimensions: [{ field: 'status_comercial', alias: 'my_status' }],
            measures: [{ field: 'id', aggregation: 'count', alias: 'total' }],
            breakdownBy: { field: 'produto', alias: 'prod' },
            filters: [],
            limit: 50,
        }
        const result = buildReportKeys(iqr)

        expect(result.dimensionKeys).toEqual(['my_status'])
        expect(result.measureKeys).toEqual(['total'])
        expect(result.breakdownKey).toBe('prod')
        expect(result.drillFieldMap.my_status).toBe('status_comercial')
    })

    it('should handle empty dimensions', () => {
        const iqr: ReportIQR = {
            source: 'cards',
            dimensions: [],
            measures: [{ field: 'id', aggregation: 'count' }],
            filters: [],
            limit: 50,
        }
        const result = buildReportKeys(iqr)

        expect(result.dimensionKeys).toEqual([])
        expect(result.measureKeys).toEqual(['mea_0'])
        expect(result.drillFieldMap).toEqual({})
    })

    it('should handle empty measures with only computedMeasures', () => {
        const iqr: ReportIQR = {
            source: 'cards',
            dimensions: [{ field: 'status_comercial' }],
            measures: [],
            computedMeasures: [{ type: 'computed', key: 'taxa_conversao' }],
            filters: [],
            limit: 50,
        }
        const result = buildReportKeys(iqr)

        expect(result.dimensionKeys).toEqual(['dim_0'])
        expect(result.measureKeys).toEqual(['taxa_conversao'])
    })

    it('should generate correct aggregation labels (sum, avg, count, etc.)', () => {
        const iqr: ReportIQR = {
            source: 'cards',
            dimensions: [{ field: 'status_comercial' }],
            measures: [
                { field: 'valor_estimado', aggregation: 'sum' },
                { field: 'valor_estimado', aggregation: 'avg' },
                { field: 'id', aggregation: 'count' },
                { field: 'id', aggregation: 'count_distinct' },
            ],
            filters: [],
            limit: 50,
        }
        const result = buildReportKeys(iqr)

        // count/count_distinct: just the field label
        // sum/avg: "Soma Label" / "Média Label"
        expect(result.labels.mea_0).toMatch(/Soma/)
        expect(result.labels.mea_1).toMatch(/Média/)
        // count doesn't have the aggregation prefix
        expect(result.labels.mea_2).not.toMatch(/Qtd/)
    })
})

// ============================================================
// mapDrillFilters
// ============================================================
describe('mapDrillFilters', () => {
    it('should map data keys to actual field names', () => {
        const filters = { dim_0: 'Em Andamento', dim_1: '2025-03' }
        const map = { dim_0: 'status_comercial', dim_1: 'created_at' }

        const result = mapDrillFilters(filters, map)
        expect(result).toEqual({
            status_comercial: 'Em Andamento',
            created_at: '2025-03',
        })
    })

    it('should pass through unmapped keys', () => {
        const filters = { dim_0: 'test', unknown_key: 'value' }
        const map = { dim_0: 'status_comercial' }

        const result = mapDrillFilters(filters, map)
        expect(result).toEqual({
            status_comercial: 'test',
            unknown_key: 'value',
        })
    })

    it('should handle empty filters', () => {
        expect(mapDrillFilters({}, {})).toEqual({})
    })

    it('should handle null/undefined values in filters', () => {
        const filters = { dim_0: null, dim_1: undefined }
        const map = { dim_0: 'field_a', dim_1: 'field_b' }

        const result = mapDrillFilters(filters, map)
        expect(result.field_a).toBeNull()
        expect(result.field_b).toBeUndefined()
    })
})

// ============================================================
// Breakdown Pivot Logic (extracted from ChartRenderer useChartData)
// ============================================================
describe('breakdown pivot logic', () => {
    // Simulating useChartData without React — pure data transformation
    function pivotBreakdown(
        rawData: Record<string, unknown>[],
        dimensionKeys: string[],
        measureKeys: string[],
        breakdownKey: string,
    ) {
        const breakdownValues = [...new Set(rawData.map(r => String(r[breakdownKey] ?? '')))]

        const dimHash = (row: Record<string, unknown>) =>
            dimensionKeys.map(k => String(row[k] ?? '')).join('|||')

        const grouped = new Map<string, Record<string, unknown>>()
        for (const row of rawData) {
            const hash = dimHash(row)
            if (!grouped.has(hash)) {
                const base: Record<string, unknown> = {}
                for (const dk of dimensionKeys) base[dk] = row[dk]
                grouped.set(hash, base)
            }
            const target = grouped.get(hash)!
            const bv = String(row[breakdownKey] ?? '')
            for (const mk of measureKeys) {
                target[`${bv}__${mk}`] = row[mk]
            }
        }

        const newMeaKeys: string[] = []
        for (const bv of breakdownValues) {
            for (const mk of measureKeys) {
                newMeaKeys.push(`${bv}__${mk}`)
            }
        }

        return {
            data: [...grouped.values()],
            measureKeys: newMeaKeys,
            breakdownValues,
        }
    }

    it('should pivot breakdown data correctly', () => {
        const rawData = [
            { dim_0: '2025-01', breakdown: 'Maldivas', mea_0: 5 },
            { dim_0: '2025-01', breakdown: 'Europa', mea_0: 3 },
            { dim_0: '2025-02', breakdown: 'Maldivas', mea_0: 8 },
            { dim_0: '2025-02', breakdown: 'Europa', mea_0: 2 },
        ]

        const result = pivotBreakdown(rawData, ['dim_0'], ['mea_0'], 'breakdown')

        expect(result.data).toHaveLength(2) // 2 unique dim_0 values
        expect(result.measureKeys).toEqual(['Maldivas__mea_0', 'Europa__mea_0'])

        // Verify values are correctly placed
        const jan = result.data.find(r => r.dim_0 === '2025-01')!
        expect(jan['Maldivas__mea_0']).toBe(5)
        expect(jan['Europa__mea_0']).toBe(3)

        const feb = result.data.find(r => r.dim_0 === '2025-02')!
        expect(feb['Maldivas__mea_0']).toBe(8)
        expect(feb['Europa__mea_0']).toBe(2)
    })

    it('should handle missing breakdown values for some dimensions', () => {
        const rawData = [
            { dim_0: '2025-01', breakdown: 'Maldivas', mea_0: 5 },
            { dim_0: '2025-02', breakdown: 'Europa', mea_0: 2 },
        ]

        const result = pivotBreakdown(rawData, ['dim_0'], ['mea_0'], 'breakdown')

        expect(result.data).toHaveLength(2)
        const jan = result.data.find(r => r.dim_0 === '2025-01')!
        expect(jan['Maldivas__mea_0']).toBe(5)
        expect(jan['Europa__mea_0']).toBeUndefined() // No Europa data for Jan
    })

    it('should handle multiple measures in breakdown', () => {
        const rawData = [
            { dim_0: 'A', breakdown: 'X', mea_0: 10, mea_1: 100 },
            { dim_0: 'A', breakdown: 'Y', mea_0: 20, mea_1: 200 },
        ]

        const result = pivotBreakdown(rawData, ['dim_0'], ['mea_0', 'mea_1'], 'breakdown')

        expect(result.measureKeys).toEqual(['X__mea_0', 'X__mea_1', 'Y__mea_0', 'Y__mea_1'])
        expect(result.data[0]['X__mea_0']).toBe(10)
        expect(result.data[0]['X__mea_1']).toBe(100)
        expect(result.data[0]['Y__mea_0']).toBe(20)
        expect(result.data[0]['Y__mea_1']).toBe(200)
    })

    it('should handle null breakdown values', () => {
        const rawData = [
            { dim_0: 'A', breakdown: null, mea_0: 5 },
            { dim_0: 'A', breakdown: 'X', mea_0: 10 },
        ]

        const result = pivotBreakdown(rawData, ['dim_0'], ['mea_0'], 'breakdown')

        // null becomes empty string via String(null) = ''
        expect(result.measureKeys).toContain('__mea_0') // empty string prefix
        expect(result.measureKeys).toContain('X__mea_0')
    })

    it('should handle multi-dimension breakdown', () => {
        const rawData = [
            { dim_0: 'Jan', dim_1: 'SDR', breakdown: 'Maldivas', mea_0: 5 },
            { dim_0: 'Jan', dim_1: 'Vendas', breakdown: 'Maldivas', mea_0: 3 },
            { dim_0: 'Jan', dim_1: 'SDR', breakdown: 'Europa', mea_0: 2 },
        ]

        const result = pivotBreakdown(rawData, ['dim_0', 'dim_1'], ['mea_0'], 'breakdown')

        // Should group by dim_0+dim_1 combination
        expect(result.data).toHaveLength(2) // "Jan|||SDR" and "Jan|||Vendas"
        const sdr = result.data.find(r => r.dim_1 === 'SDR')!
        expect(sdr['Maldivas__mea_0']).toBe(5)
        expect(sdr['Europa__mea_0']).toBe(2)
    })
})

// ============================================================
// keyFormats propagation to breakdown keys
// ============================================================
describe('keyFormats propagation for breakdown', () => {
    function propagateKeyFormats(
        rawKeyFormats: Record<string, 'number' | 'currency' | 'percent'>,
        pivotedMeasureKeys: string[],
    ) {
        const adjusted = { ...rawKeyFormats }
        for (const newKey of pivotedMeasureKeys) {
            const originalKey = newKey.split('__').pop()!
            if (rawKeyFormats[originalKey]) {
                adjusted[newKey] = rawKeyFormats[originalKey]
            }
        }
        return adjusted
    }

    it('should propagate currency format to pivoted keys', () => {
        const rawFormats = { mea_0: 'currency' as const, mea_1: 'number' as const }
        const pivotedKeys = ['Maldivas__mea_0', 'Europa__mea_0', 'Maldivas__mea_1', 'Europa__mea_1']

        const result = propagateKeyFormats(rawFormats, pivotedKeys)

        expect(result['Maldivas__mea_0']).toBe('currency')
        expect(result['Europa__mea_0']).toBe('currency')
        expect(result['Maldivas__mea_1']).toBe('number')
        expect(result['Europa__mea_1']).toBe('number')
        // Original keys should still exist
        expect(result.mea_0).toBe('currency')
        expect(result.mea_1).toBe('number')
    })

    it('should handle keys without format (no-op)', () => {
        const rawFormats = { mea_0: 'currency' as const }
        const pivotedKeys = ['X__mea_0', 'X__mea_1'] // mea_1 has no format

        const result = propagateKeyFormats(rawFormats, pivotedKeys)

        expect(result['X__mea_0']).toBe('currency')
        expect(result['X__mea_1']).toBeUndefined()
    })

    it('should handle breakdown value with double underscores', () => {
        // Edge case: breakdown value itself contains "__"
        const rawFormats = { mea_0: 'percent' as const }
        const pivotedKeys = ['Some__Value__mea_0'] // "Some__Value" is the breakdown value

        const result = propagateKeyFormats(rawFormats, pivotedKeys)

        // split('__').pop() returns 'mea_0' regardless of how many __ are in the value
        expect(result['Some__Value__mea_0']).toBe('percent')
    })
})

// ============================================================
// Composite label logic
// ============================================================
describe('composite label creation', () => {
    function createCompositeLabels(
        data: Record<string, unknown>[],
        dimKeys: string[],
        dateGrouping?: string,
    ) {
        const COMPOSITE_KEY = '_label'
        return data.map(row => ({
            ...row,
            [COMPOSITE_KEY]: dimKeys.map(k => {
                const v = String(row[k] ?? '')
                if (dateGrouping && /^\d{4}-\d{2}/.test(v)) {
                    return formatDateAxis(v, dateGrouping)
                }
                return v
            }).join(' · '),
        }))
    }

    it('should join multiple dimension values', () => {
        const data = [
            { dim_0: 'Em Andamento', dim_1: 'Pacote', mea_0: 10 },
            { dim_0: 'Ganho', dim_1: 'Receptivo', mea_0: 5 },
        ]

        const result = createCompositeLabels(data, ['dim_0', 'dim_1'])

        expect(result[0]._label).toBe('Em Andamento · Pacote')
        expect(result[1]._label).toBe('Ganho · Receptivo')
    })

    it('should format date values when dateGrouping is set', () => {
        const data = [
            { dim_0: 'Ativo', dim_1: '2025-03-01', mea_0: 10 },
        ]

        const result = createCompositeLabels(data, ['dim_0', 'dim_1'], 'month')

        // "2025-03-01" with month grouping → should be "mar. de 2025" or similar pt-BR format
        expect(result[0]._label).toContain('Ativo')
        expect(result[0]._label).toContain('·')
        // Should NOT contain raw "2025-03-01"
        expect(result[0]._label).not.toContain('2025-03-01')
    })

    it('should handle null values', () => {
        const data = [
            { dim_0: null, dim_1: 'B', mea_0: 1 },
        ]

        const result = createCompositeLabels(data, ['dim_0', 'dim_1'])

        expect(result[0]._label).toBe(' · B')
    })
})

// ============================================================
// wrappedDrillDown logic
// ============================================================
describe('wrappedDrillDown composite → original mapping', () => {
    function wrappedDrillDown(
        filters: Record<string, unknown>,
        data: Record<string, unknown>[],
        originalDimKeys: string[],
    ): Record<string, unknown> {
        const COMPOSITE_KEY = '_label'
        if (COMPOSITE_KEY in filters) {
            const row = data.find(r => r[COMPOSITE_KEY] === filters[COMPOSITE_KEY])
            if (row) {
                const realFilters: Record<string, unknown> = {}
                for (const dk of originalDimKeys) {
                    if (row[dk] != null) realFilters[dk] = row[dk]
                }
                return realFilters
            }
        }
        return filters
    }

    it('should map composite label back to original dimension values', () => {
        const data = [
            { _label: 'Em Andamento · Pacote', dim_0: 'Em Andamento', dim_1: 'Pacote', mea_0: 10 },
            { _label: 'Ganho · Receptivo', dim_0: 'Ganho', dim_1: 'Receptivo', mea_0: 5 },
        ]

        const result = wrappedDrillDown(
            { _label: 'Em Andamento · Pacote' },
            data,
            ['dim_0', 'dim_1'],
        )

        expect(result).toEqual({ dim_0: 'Em Andamento', dim_1: 'Pacote' })
    })

    it('should pass through filters without composite key', () => {
        const data = [{ _label: 'X', dim_0: 'X', mea_0: 1 }]

        const result = wrappedDrillDown(
            { dim_0: 'X' },
            data,
            ['dim_0'],
        )

        expect(result).toEqual({ dim_0: 'X' })
    })

    it('should handle composite label not found in data', () => {
        const data = [{ _label: 'A', dim_0: 'A', mea_0: 1 }]

        const result = wrappedDrillDown(
            { _label: 'NOT_FOUND' },
            data,
            ['dim_0'],
        )

        // Falls through to returning original filters
        expect(result).toEqual({ _label: 'NOT_FOUND' })
    })

    it('should skip null original dimension values', () => {
        const data = [
            { _label: ' · B', dim_0: null, dim_1: 'B', mea_0: 1 },
        ]

        const result = wrappedDrillDown(
            { _label: ' · B' },
            data,
            ['dim_0', 'dim_1'],
        )

        // dim_0 is null, should be excluded from drill filters
        expect(result).toEqual({ dim_1: 'B' })
    })
})

// ============================================================
// FilterPanel handleOperatorChange logic
// ============================================================
describe('FilterPanel handleOperatorChange transitions', () => {
    type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'like' | 'is_null' | 'is_not_null' | 'between'

    const NO_VALUE_OPERATORS: FilterOperator[] = ['is_null', 'is_not_null']
    const ARRAY_OPERATORS: FilterOperator[] = ['in', 'not_in']

    function handleOperatorChange(filter: FilterSpec, newOp: FilterOperator): FilterSpec['value'] {
        if (NO_VALUE_OPERATORS.includes(newOp)) return null
        if (newOp === 'between') return ['', '']
        if (ARRAY_OPERATORS.includes(newOp)) {
            if (Array.isArray(filter.value)) return filter.value
            if (filter.value && String(filter.value).trim()) return [String(filter.value)]
            return []
        }
        // Scalar
        if (Array.isArray(filter.value) && filter.value.length > 0) {
            return filter.value[0] // FIX: was String(filter.value[0]) before
        }
        return ''
    }

    // eq → various operators
    it('eq "test" → is_null: value should be null', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'eq', value: 'test' }, 'is_null')
        expect(result).toBeNull()
    })

    it('eq "test" → between: value should be ["",""]', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'eq', value: 'test' }, 'between')
        expect(result).toEqual(['', ''])
    })

    it('eq "test" → in: value should be ["test"]', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'eq', value: 'test' }, 'in')
        expect(result).toEqual(['test'])
    })

    it('eq "" → in: value should be [] (empty string trimmed away)', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'eq', value: '' }, 'in')
        expect(result).toEqual([])
    })

    // in → scalar
    it('in ["a","b"] → eq: value should be "a" (first item)', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'in', value: ['a', 'b'] }, 'eq')
        expect(result).toBe('a')
    })

    it('in [] → eq: value should be "" (empty array)', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'in', value: [] }, 'eq')
        expect(result).toBe('')
    })

    // between → scalar
    it('between [10, 20] → eq: value should be 10 (preserves number type)', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'between', value: [10, 20] }, 'eq')
        expect(result).toBe(10)
        expect(typeof result).toBe('number') // CRITICAL: must NOT be string "10"
    })

    it('between ["2025-01-01", "2025-12-31"] → eq: value should be "2025-01-01"', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'between', value: ['2025-01-01', '2025-12-31'] }, 'eq')
        expect(result).toBe('2025-01-01')
    })

    // is_null → scalar
    it('is_null null → eq: value should be "" (from empty array path)', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'is_null', value: null }, 'eq')
        expect(result).toBe('')
    })

    // in → not_in (array to array)
    it('in ["a","b"] → not_in: value should be preserved ["a","b"]', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'in', value: ['a', 'b'] }, 'not_in')
        expect(result).toEqual(['a', 'b'])
    })

    // between → in
    it('between [1, 100] → in: value should be preserved array [1, 100]', () => {
        const result = handleOperatorChange({ field: 'x', operator: 'between', value: [1, 100] }, 'in')
        expect(result).toEqual([1, 100])
    })

    // Cycle: eq → between → eq (verify no type corruption)
    it('full cycle eq(42) → between → eq should preserve number', () => {
        let value: FilterSpec['value'] = 42
        // Step 1: eq → between
        value = handleOperatorChange({ field: 'x', operator: 'eq', value }, 'between')
        expect(value).toEqual(['', ''])
        // Step 2: Fill between values (simulates user input with number field)
        value = [100, 200]
        // Step 3: between → eq
        value = handleOperatorChange({ field: 'x', operator: 'between', value }, 'eq')
        expect(value).toBe(100)
        expect(typeof value).toBe('number')
    })
})

// ============================================================
// Formatters
// ============================================================
describe('formatters', () => {
    describe('formatCurrency', () => {
        it('should format values >= 1M as "R$ X.X mi"', () => {
            expect(formatCurrency(1_000_000)).toBe('R$ 1.0 mi')
            expect(formatCurrency(2_500_000)).toBe('R$ 2.5 mi')
            expect(formatCurrency(10_000_000)).toBe('R$ 10.0 mi')
        })

        it('should format values >= 1K as "R$ X mil"', () => {
            const result = formatCurrency(5_000)
            expect(result).toContain('mil')
        })

        it('should format values < 1K as full currency', () => {
            const result = formatCurrency(500)
            expect(result).toContain('R$')
            expect(result).toContain('500')
        })

        it('should handle zero', () => {
            const result = formatCurrency(0)
            expect(result).toContain('R$')
        })

        it('should handle negative values', () => {
            const result = formatCurrency(-500)
            expect(result).toContain('R$')
        })
    })

    describe('formatPercent', () => {
        it('should append %', () => {
            expect(formatPercent(75)).toBe('75%')
            expect(formatPercent(99.9)).toBe('99,9%')
        })

        it('should handle 0', () => {
            expect(formatPercent(0)).toBe('0%')
        })

        it('should handle > 100', () => {
            const result = formatPercent(150)
            expect(result).toContain('150')
            expect(result).toContain('%')
        })
    })

    describe('formatDays', () => {
        it('should use singular for 1 day', () => {
            expect(formatDays(1)).toBe('1 dia')
        })

        it('should use plural for other values', () => {
            expect(formatDays(0)).toBe('0 dias')
            expect(formatDays(5)).toBe('5 dias')
            expect(formatDays(30)).toBe('30 dias')
        })

        it('should round decimal values', () => {
            expect(formatDays(3.7)).toBe('4 dias')
        })
    })

    describe('autoFormat', () => {
        it('should format as currency', () => {
            const result = autoFormat(50000, 'currency')
            expect(result).toContain('R$')
        })

        it('should format as percent', () => {
            const result = autoFormat(75, 'percent')
            expect(result).toContain('%')
        })

        it('should format as number by default', () => {
            const result = autoFormat(1234, undefined)
            expect(result).toBeTruthy()
        })

        it('should handle NaN gracefully', () => {
            expect(autoFormat('not_a_number', 'currency')).toBe('not_a_number')
            expect(autoFormat(null, 'currency')).toBe('—')
            expect(autoFormat(undefined, 'currency')).toBe('—')
        })

        it('should handle string numbers', () => {
            const result = autoFormat('1000', 'currency')
            expect(result).toContain('R$')
        })
    })

    describe('formatDateAxis', () => {
        it('should format day as DD/MM', () => {
            const result = formatDateAxis('2025-03-15', 'day')
            expect(result).toMatch(/15\/03/)
        })

        it('should format week as "Sem X, MMM"', () => {
            const result = formatDateAxis('2025-03-15', 'week')
            expect(result).toContain('Sem')
        })

        it('should format quarter as "TX YYYY"', () => {
            const result = formatDateAxis('2025-03-15', 'quarter')
            expect(result).toBe('T1 2025')
        })

        it('should format year as "YYYY"', () => {
            const result = formatDateAxis('2025-03-15', 'year')
            expect(result).toBe('2025')
        })

        it('should format month as "MMM YYYY" by default', () => {
            const result = formatDateAxis('2025-03-15', 'month')
            expect(result).toBeTruthy()
            // Should contain some month abbreviation
        })

        it('should return original string for invalid dates', () => {
            expect(formatDateAxis('not-a-date', 'day')).toBe('not-a-date')
        })
    })
})

// ============================================================
// Zustand store action sequence simulation
// ============================================================
// Shared mock store for state machine tests
function createMockStore() {
        let state = {
            source: null as string | null,
            dimensions: [] as { field: string; dateGrouping?: string; alias?: string }[],
            measures: [] as { field: string; aggregation: string; alias?: string }[],
            computedMeasures: [] as { type: string; key: string; alias?: string }[],
            breakdownBy: null as { field: string; alias?: string } | null,
            filters: [] as FilterSpec[],
            orderBy: null as { field: string; direction: string } | null,
            limit: 50,
            comparison: null as { type: string } | null,
            isDirty: false,
        }

        return {
            get: () => state,
            setSource: (source: string) => {
                state = { ...state, source, dimensions: [], measures: [], computedMeasures: [], breakdownBy: null, filters: [], orderBy: null, isDirty: true }
            },
            addDimension: (dim: { field: string; dateGrouping?: string }) => {
                if (state.dimensions.some(d => d.field === dim.field)) return
                state = { ...state, dimensions: [...state.dimensions, dim], isDirty: true }
            },
            removeDimension: (field: string) => {
                const updates: Record<string, unknown> = {
                    dimensions: state.dimensions.filter(d => d.field !== field),
                    isDirty: true,
                }
                if (state.breakdownBy?.field === field) updates.breakdownBy = null
                if (state.orderBy?.field === field) updates.orderBy = null
                state = { ...state, ...updates } as typeof state
            },
            addMeasure: (m: { field: string; aggregation: string }) => {
                if (state.measures.some(existing => existing.field === m.field)) return
                state = { ...state, measures: [...state.measures, m], isDirty: true }
            },
            removeMeasure: (field: string) => {
                const updates: Record<string, unknown> = {
                    measures: state.measures.filter(m => m.field !== field),
                    isDirty: true,
                }
                if (state.orderBy?.field === field) updates.orderBy = null
                state = { ...state, ...updates } as typeof state
            },
            addFilter: (filter: FilterSpec) => {
                state = { ...state, filters: [...state.filters, filter], isDirty: true }
            },
            removeFilter: (index: number) => {
                state = { ...state, filters: state.filters.filter((_, i) => i !== index), isDirty: true }
            },
            updateFilter: (index: number, filter: FilterSpec) => {
                state = { ...state, filters: state.filters.map((f, i) => i === index ? filter : f), isDirty: true }
            },
            setBreakdownBy: (dim: { field: string } | null) => {
                state = { ...state, breakdownBy: dim, isDirty: true }
            },
            setOrderBy: (order: { field: string; direction: string } | null) => {
                state = { ...state, orderBy: order, isDirty: true }
            },
            reorderDimensions: (oldIndex: number, newIndex: number) => {
                const arr = [...state.dimensions]
                const [moved] = arr.splice(oldIndex, 1)
                arr.splice(newIndex, 0, moved)
                state = { ...state, dimensions: arr, isDirty: true }
            },
            reorderMeasures: (oldIndex: number, newIndex: number) => {
                const arr = [...state.measures]
                const [moved] = arr.splice(oldIndex, 1)
                arr.splice(newIndex, 0, moved)
                state = { ...state, measures: arr, isDirty: true }
            },
            addComputedMeasure: (cm: { type: string; key: string }) => {
                if (state.computedMeasures.some(existing => existing.key === cm.key)) return
                state = { ...state, computedMeasures: [...state.computedMeasures, cm], isDirty: true }
            },
            setLimit: (limit: number) => {
                state = { ...state, limit: Math.min(Math.max(1, limit), 5000), isDirty: true }
            },
            toIQR: () => {
                if (!state.source) return null
                return {
                    source: state.source,
                    dimensions: state.dimensions,
                    measures: state.measures,
                    computedMeasures: state.computedMeasures.length > 0 ? state.computedMeasures : undefined,
                    breakdownBy: state.breakdownBy ?? undefined,
                    filters: state.filters,
                    orderBy: state.orderBy ?? undefined,
                    limit: state.limit,
                    comparison: state.comparison ?? undefined,
                }
            },
        }
    }

describe('ReportBuilderStore action sequences', () => {
    it('Scenario: Build a complete report from scratch', () => {
        const store = createMockStore()

        // Step 1: Select source
        store.setSource('cards')
        expect(store.get().source).toBe('cards')
        expect(store.get().dimensions).toEqual([])

        // Step 2: Add dimension
        store.addDimension({ field: 'status_comercial' })
        expect(store.get().dimensions).toHaveLength(1)

        // Step 3: Add measure
        store.addMeasure({ field: 'id', aggregation: 'count' })
        expect(store.get().measures).toHaveLength(1)

        // Step 4: Add filter
        store.addFilter({ field: 'produto', operator: 'eq', value: 'Pacote' })
        expect(store.get().filters).toHaveLength(1)

        // Step 5: Generate IQR
        const iqr = store.toIQR()
        expect(iqr).not.toBeNull()
        expect(iqr!.source).toBe('cards')
        expect(iqr!.dimensions).toHaveLength(1)
        expect(iqr!.measures).toHaveLength(1)
        expect(iqr!.filters).toHaveLength(1)
    })

    it('Scenario: Remove dimension cleans orphan breakdownBy', () => {
        const store = createMockStore()
        store.setSource('cards')
        store.addDimension({ field: 'produto' })
        store.setBreakdownBy({ field: 'produto' })
        expect(store.get().breakdownBy?.field).toBe('produto')

        // Remove the dimension that breakdownBy references
        store.removeDimension('produto')
        expect(store.get().breakdownBy).toBeNull()
    })

    it('Scenario: Remove dimension cleans orphan orderBy', () => {
        const store = createMockStore()
        store.setSource('cards')
        store.addDimension({ field: 'status_comercial' })
        store.setOrderBy({ field: 'status_comercial', direction: 'asc' })
        expect(store.get().orderBy?.field).toBe('status_comercial')

        store.removeDimension('status_comercial')
        expect(store.get().orderBy).toBeNull()
    })

    it('Scenario: Remove measure cleans orphan orderBy', () => {
        const store = createMockStore()
        store.setSource('cards')
        store.addMeasure({ field: 'valor_estimado', aggregation: 'sum' })
        store.setOrderBy({ field: 'valor_estimado', direction: 'desc' })

        store.removeMeasure('valor_estimado')
        expect(store.get().orderBy).toBeNull()
    })

    it('Scenario: Reorder dimensions', () => {
        const store = createMockStore()
        store.setSource('cards')
        store.addDimension({ field: 'A' })
        store.addDimension({ field: 'B' })
        store.addDimension({ field: 'C' })

        // Move C (index 2) to position 0
        store.reorderDimensions(2, 0)
        expect(store.get().dimensions.map(d => d.field)).toEqual(['C', 'A', 'B'])

        // Move A (now index 1) to position 2
        store.reorderDimensions(1, 2)
        expect(store.get().dimensions.map(d => d.field)).toEqual(['C', 'B', 'A'])
    })

    it('Scenario: Reorder measures', () => {
        const store = createMockStore()
        store.setSource('cards')
        store.addMeasure({ field: 'X', aggregation: 'sum' })
        store.addMeasure({ field: 'Y', aggregation: 'count' })

        store.reorderMeasures(1, 0)
        expect(store.get().measures.map(m => m.field)).toEqual(['Y', 'X'])
    })

    it('Scenario: setSource clears all config', () => {
        const store = createMockStore()
        store.setSource('cards')
        store.addDimension({ field: 'A' })
        store.addMeasure({ field: 'B', aggregation: 'sum' })
        store.addFilter({ field: 'C', operator: 'eq', value: 'x' })
        store.setBreakdownBy({ field: 'D' })
        store.setOrderBy({ field: 'B', direction: 'desc' })

        // Switching source should clear everything
        store.setSource('contatos')
        expect(store.get().source).toBe('contatos')
        expect(store.get().dimensions).toEqual([])
        expect(store.get().measures).toEqual([])
        expect(store.get().filters).toEqual([])
        expect(store.get().breakdownBy).toBeNull()
        expect(store.get().orderBy).toBeNull()
    })

    it('Scenario: Remove filter by index with multiple filters', () => {
        const store = createMockStore()
        store.setSource('cards')
        store.addFilter({ field: 'A', operator: 'eq', value: '1' })
        store.addFilter({ field: 'B', operator: 'gt', value: 10 })
        store.addFilter({ field: 'C', operator: 'in', value: ['x', 'y'] })

        // Remove middle filter
        store.removeFilter(1)
        expect(store.get().filters).toHaveLength(2)
        expect(store.get().filters[0].field).toBe('A')
        expect(store.get().filters[1].field).toBe('C')
    })

    it('Scenario: Update filter preserves other filters', () => {
        const store = createMockStore()
        store.setSource('cards')
        store.addFilter({ field: 'A', operator: 'eq', value: '1' })
        store.addFilter({ field: 'B', operator: 'gt', value: 10 })

        store.updateFilter(1, { field: 'B', operator: 'lt', value: 5 })
        expect(store.get().filters[0]).toEqual({ field: 'A', operator: 'eq', value: '1' })
        expect(store.get().filters[1]).toEqual({ field: 'B', operator: 'lt', value: 5 })
    })

    it('Scenario: setLimit clamps between 1 and 5000', () => {
        const store = createMockStore()
        store.setSource('cards')

        store.setLimit(0)
        expect(store.get().limit).toBe(1)

        store.setLimit(10000)
        expect(store.get().limit).toBe(5000)

        store.setLimit(100)
        expect(store.get().limit).toBe(100)

        store.setLimit(-5)
        expect(store.get().limit).toBe(1)
    })

    it('Scenario: toIQR returns null without source', () => {
        const store = createMockStore()
        expect(store.toIQR()).toBeNull()
    })

    it('Scenario: toIQR omits empty optional fields', () => {
        const store = createMockStore()
        store.setSource('cards')
        store.addMeasure({ field: 'id', aggregation: 'count' })

        const iqr = store.toIQR()!
        expect(iqr.computedMeasures).toBeUndefined()
        expect(iqr.breakdownBy).toBeUndefined()
        expect(iqr.orderBy).toBeUndefined()
        expect(iqr.comparison).toBeUndefined()
    })
})

// ============================================================
// DnD Cross-Component Simulation Tests
// (Tests the handlePickerDragEnd logic extracted from ReportBuilder)
// ============================================================

describe('DnD picker-to-config simulation', () => {
    // Simulate the handlePickerDragEnd logic from ReportBuilder
    // This is an exact copy of the logic to test it in isolation
    function simulateDrop(
        store: ReturnType<typeof createMockStore>,
        activeData: Record<string, unknown>,
        overId: string | null,
    ) {
        if (!activeData || activeData.type !== 'picker-field' || !overId) return

        const droppedOnAnyZone = overId === 'dropzone-dimensions' || overId === 'dropzone-measures'
        if (!droppedOnAnyZone) return

        if (activeData.role === 'dimension') {
            const field = activeData.field as { key: string; dataType?: string }
            const dim: { field: string; dateGrouping?: string } = { field: field.key }
            if (field.dataType === 'date') dim.dateGrouping = 'month'
            store.addDimension(dim)
        } else if (activeData.role === 'measure') {
            const field = activeData.field as { key: string; aggregations?: string[] }
            const defaultAgg = field.aggregations?.[0] ?? 'count'
            store.addMeasure({ field: field.key, aggregation: defaultAgg })
        } else if (activeData.role === 'computed') {
            store.addComputedMeasure({ type: 'computed', key: activeData.key as string })
        }
    }

    const getStore = () => {
        const store = createMockStore()
        store.setSource('cards')
        return store
    }

    it('should add dimension when dropped on dimensions zone', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'dimension',
            field: { key: 'ps.nome', dataType: 'text' },
        }, 'dropzone-dimensions')

        expect(store.get().dimensions).toHaveLength(1)
        expect(store.get().dimensions[0].field).toBe('ps.nome')
    })

    it('should auto-set dateGrouping for date dimension', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'dimension',
            field: { key: 'c.created_at', dataType: 'date' },
        }, 'dropzone-dimensions')

        expect(store.get().dimensions[0].dateGrouping).toBe('month')
    })

    it('should NOT set dateGrouping for non-date dimension', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'dimension',
            field: { key: 'ps.nome', dataType: 'text' },
        }, 'dropzone-dimensions')

        expect(store.get().dimensions[0].dateGrouping).toBeUndefined()
    })

    it('should add measure when dropped on measures zone', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'measure',
            field: { key: 'c.id', aggregations: ['count', 'count_distinct'] },
        }, 'dropzone-measures')

        expect(store.get().measures).toHaveLength(1)
        expect(store.get().measures[0].field).toBe('c.id')
        expect(store.get().measures[0].aggregation).toBe('count')
    })

    it('should use first aggregation as default', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'measure',
            field: { key: 'c.valor_final', aggregations: ['sum', 'avg', 'min', 'max'] },
        }, 'dropzone-measures')

        expect(store.get().measures[0].aggregation).toBe('sum')
    })

    it('should fallback to count if no aggregations defined', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'measure',
            field: { key: 'unknown_field' },
        }, 'dropzone-measures')

        expect(store.get().measures[0].aggregation).toBe('count')
    })

    it('should add computed measure when dropped on measures zone', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'computed',
            key: 'taxa_conversao',
            label: 'Taxa de Conversão',
        }, 'dropzone-measures')

        expect(store.get().computedMeasures).toHaveLength(1)
        expect(store.get().computedMeasures[0].key).toBe('taxa_conversao')
    })

    it('should smart-route: dimension dropped on MEASURES zone still adds as dimension', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'dimension',
            field: { key: 'ps.nome', dataType: 'text' },
        }, 'dropzone-measures') // Wrong zone!

        // Smart-routing: adds to dimensions regardless of target zone
        expect(store.get().dimensions).toHaveLength(1)
        expect(store.get().dimensions[0].field).toBe('ps.nome')
        expect(store.get().measures).toHaveLength(0)
    })

    it('should smart-route: measure dropped on DIMENSIONS zone still adds as measure', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'measure',
            field: { key: 'c.id', aggregations: ['count'] },
        }, 'dropzone-dimensions') // Wrong zone!

        // Smart-routing: adds to measures regardless of target zone
        expect(store.get().measures).toHaveLength(1)
        expect(store.get().measures[0].field).toBe('c.id')
        expect(store.get().dimensions).toHaveLength(0)
    })

    it('should ignore drop outside any zone (over=null)', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'dimension',
            field: { key: 'ps.nome', dataType: 'text' },
        }, null)

        expect(store.get().dimensions).toHaveLength(0)
    })

    it('should ignore non-picker drags', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'sortable-item',
            id: 'ps.nome',
        }, 'dropzone-dimensions')

        expect(store.get().dimensions).toHaveLength(0)
    })

    it('should not add duplicate dimension via drag', () => {
        const store = getStore()
        // Add first via drag
        simulateDrop(store, {
            type: 'picker-field',
            role: 'dimension',
            field: { key: 'ps.nome', dataType: 'text' },
        }, 'dropzone-dimensions')
        // Try to add again via drag
        simulateDrop(store, {
            type: 'picker-field',
            role: 'dimension',
            field: { key: 'ps.nome', dataType: 'text' },
        }, 'dropzone-dimensions')

        expect(store.get().dimensions).toHaveLength(1)
    })

    it('should not add duplicate measure via drag', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'measure',
            field: { key: 'c.id', aggregations: ['count'] },
        }, 'dropzone-measures')
        simulateDrop(store, {
            type: 'picker-field',
            role: 'measure',
            field: { key: 'c.id', aggregations: ['count'] },
        }, 'dropzone-measures')

        expect(store.get().measures).toHaveLength(1)
    })

    it('should handle rapid sequential drops of different fields', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field', role: 'dimension',
            field: { key: 'ps.nome', dataType: 'text' },
        }, 'dropzone-dimensions')
        simulateDrop(store, {
            type: 'picker-field', role: 'dimension',
            field: { key: 'c.created_at', dataType: 'date' },
        }, 'dropzone-dimensions')
        simulateDrop(store, {
            type: 'picker-field', role: 'measure',
            field: { key: 'c.id', aggregations: ['count'] },
        }, 'dropzone-measures')
        simulateDrop(store, {
            type: 'picker-field', role: 'computed',
            key: 'taxa_conversao',
        }, 'dropzone-measures')

        expect(store.get().dimensions).toHaveLength(2)
        expect(store.get().dimensions[0].field).toBe('ps.nome')
        expect(store.get().dimensions[1].field).toBe('c.created_at')
        expect(store.get().dimensions[1].dateGrouping).toBe('month')
        expect(store.get().measures).toHaveLength(1)
        expect(store.get().computedMeasures).toHaveLength(1)
    })

    it('should ignore drop on unknown zone ID', () => {
        const store = getStore()
        simulateDrop(store, {
            type: 'picker-field',
            role: 'dimension',
            field: { key: 'ps.nome', dataType: 'text' },
        }, 'dropzone-unknown')

        expect(store.get().dimensions).toHaveLength(0)
    })
})
