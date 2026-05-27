import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const dbg: Record<string, unknown> = { step: 'start' }
    try {
        dbg.step = 'read body'
        const rawBody = await req.text()
        dbg.rawBody = rawBody
        let contact_id: string | undefined, deal_id: string | undefined
        try {
            const parsed = JSON.parse(rawBody || '{}')
            contact_id = parsed.contact_id
            deal_id = parsed.deal_id
        } catch (e) {
            return new Response(JSON.stringify({ ...dbg, jsonParseError: String(e) }), { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 })
        }
        dbg.contact_id = contact_id
        dbg.deal_id = deal_id

        dbg.step = 'create supabase client'
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        dbg.step = 'fetch AC settings via RPC (decrypted)'
        const [urlRes, keyRes] = await Promise.all([
            supabase.rpc('get_outbound_setting', { p_key: 'ACTIVECAMPAIGN_API_URL' }),
            supabase.rpc('get_outbound_setting', { p_key: 'ACTIVECAMPAIGN_API_KEY' }),
        ])
        if (urlRes.error || keyRes.error) {
            dbg.urlErr = urlRes.error?.message
            dbg.keyErr = keyRes.error?.message
            return new Response(JSON.stringify(dbg), { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 })
        }
        const acUrl = urlRes.data as string | null
        const acKey = keyRes.data as string | null
        dbg.acUrl_present = !!acUrl
        dbg.acKey_present = !!acKey
        dbg.acKey_len = acKey ? String(acKey).length : 0
        if (!acUrl || !acKey) {
            return new Response(JSON.stringify(dbg), { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 })
        }

        const result: Record<string, unknown> = { dbg }

        if (deal_id) {
            // Tentar várias formas de listar contatos de um deal
            const endpoints = [
                `/api/3/deals/${deal_id}/contacts`,
                `/api/3/deals/${deal_id}?include=contacts`,
                `/api/3/contactDeals?filters[deal]=${deal_id}`,
                `/api/3/dealGroups/${deal_id}/contacts`,
            ]
            const tries: Record<string, unknown> = {}
            for (const ep of endpoints) {
                try {
                    const r = await fetch(`${acUrl}${ep}`, { headers: { 'Api-Token': acKey } })
                    const t = await r.text()
                    tries[ep] = { status: r.status, body: t.substring(0, 300) }
                } catch (e) {
                    tries[ep] = { error: String(e) }
                }
            }
            result.dealContactsEndpoints = tries
        }

        if (contact_id) {
            dbg.step = 'fetch contact'
            const r2 = await fetch(`${acUrl}/api/3/contacts/${contact_id}?include=fieldValues`, { headers: { 'Api-Token': acKey } })
            const t2 = await r2.text()
            dbg.contactStatus = r2.status
            try {
                const j2 = JSON.parse(t2)
                const contact = j2.contact
                const fieldValues = j2.fieldValues || []
                const filledFields = fieldValues.filter((fv: { value: string | null }) => fv.value !== null && fv.value !== '' && fv.value !== undefined)
                result.contact = contact ? { id: contact.id, email: contact.email, firstName: contact.firstName, lastName: contact.lastName } : null
                result.filledFieldsCount = filledFields.length
                const keyFieldIds = ['7', '8', '11', '89', '121', '376']
                result.keyFields = Object.fromEntries(
                    keyFieldIds.map(id => {
                        const fv = fieldValues.find((x: { field: string; value: string }) => String(x.field) === id)
                        return [id, fv?.value ?? null]
                    })
                )
                result.allFilled = filledFields.map((fv: { field: string; value: string }) => ({ field_id: fv.field, value: fv.value }))
            } catch (_e) {
                result.contactRaw = t2.substring(0, 500)
            }
        }

        return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return new Response(JSON.stringify({ ...dbg, error: msg }), { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 })
    }
})
