import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runE2ETest() {
    console.log('🚀 Starting Workflow Engine E2E Test...');

    // 1. Create a Test Workflow
    console.log('1. Creating Test Workflow...');
    const { data: workflowId, error: wfError } = await supabase.rpc('save_workflow_definition', {
        p_name: 'E2E Test Workflow',
        p_description: 'Created by E2E Script',
        p_trigger_type: 'stage_enter',
        p_trigger_config: {},
        p_is_active: true,
        p_nodes: [
            { id: 'node-1', node_key: 'trigger', node_type: 'trigger', position_x: 0, position_y: 0 },
            { id: 'node-2', node_key: 'action', node_type: 'action', action_type: 'create_task', action_config: { titulo: 'E2E Task' }, position_x: 100, position_y: 0 },
            { id: 'node-3', node_key: 'end', node_type: 'end', position_x: 200, position_y: 0 }
        ],
        p_edges: [
            { id: 'edge-1', source_node_id: 'node-1', target_node_id: 'node-2', edge_order: 0 },
            { id: 'edge-2', source_node_id: 'node-2', target_node_id: 'node-3', edge_order: 0 }
        ]
    });

    if (wfError) {
        console.error('❌ Failed to create workflow:', wfError);
        return;
    }
    console.log('✅ Workflow created:', workflowId);

    // 2. Trigger Test (Dry Run)
    console.log('2. Triggering Dry Run...');
    const { data: testResult, error: testError } = await supabase.functions.invoke('workflow-engine', {
        body: {
            action: 'trigger_test',
            workflow_id: workflowId,
            card_id: '00000000-0000-0000-0000-000000000000' // Mock ID
        }
    });

    if (testError) {
        console.error('❌ Test Trigger failed:', testError);
    } else {
        console.log('✅ Test Trigger success:', testResult);
    }

    // 3. Cleanup
    console.log('3. Cleaning up...');
    await supabase.from('workflows').delete().eq('id', workflowId);
    console.log('✅ Cleanup done.');
}

runE2ETest();
