import { useMemo } from 'react'
import type { DataSource, FieldDefinition, ComputedMeasureDefinition } from '@/lib/reports/reportTypes'
import {
    getFieldsForSource,
    getDimensionsForSource,
    getMeasuresForSource,
    getComputedMeasuresForSource,
    getCategoriesForSource,
} from '@/lib/reports/fieldRegistry'
import { useReceitaPermission } from '@/hooks/useReceitaPermission'

/** Returns fields filtered by user permissions */
export function useFieldRegistry(source: DataSource | null) {
    const { canView: canViewReceita } = useReceitaPermission()

    return useMemo(() => {
        if (!source) {
            return {
                allFields: [] as FieldDefinition[],
                dimensions: [] as FieldDefinition[],
                measures: [] as FieldDefinition[],
                computedMeasures: [] as ComputedMeasureDefinition[],
                categories: [] as string[],
                dimensionCategories: [] as string[],
                measureCategories: [] as string[],
            }
        }

        const filterByPermission = (fields: FieldDefinition[]) =>
            fields.filter(f => {
                if (f.requiresPermission === 'receita' && !canViewReceita) return false
                return true
            })

        const filterComputedByPermission = (measures: ComputedMeasureDefinition[]) =>
            measures.filter(m => {
                if (m.requiresPermission === 'receita' && !canViewReceita) return false
                return true
            })

        const allFields = filterByPermission(getFieldsForSource(source))
        const dimensions = filterByPermission(getDimensionsForSource(source))
        const measures = filterByPermission(getMeasuresForSource(source))
        const computedMeasures = filterComputedByPermission(getComputedMeasuresForSource(source))

        return {
            allFields,
            dimensions,
            measures,
            computedMeasures,
            categories: getCategoriesForSource(source),
            dimensionCategories: [...new Set(dimensions.map(f => f.category))],
            measureCategories: [...new Set(measures.map(f => f.category))],
        }
    }, [source, canViewReceita])
}
