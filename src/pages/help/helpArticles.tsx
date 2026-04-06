/* eslint-disable react-refresh/only-export-components */
// Este arquivo contém artigos do help center como componentes React.
// Fast refresh não se aplica porque exportamos tanto dados (HELP_ARTICLES) quanto
// components helpers (H2/P/etc). Isso é intencional — ignorar regra.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export interface HelpArticle {
    id: string
    category: string
    title: string
    summary: string
    searchText: string // texto plain para busca
    Content: () => ReactNode
    related?: string[]
}

// Helpers de estilo para manter artigos consistentes
const H2 = ({ children }: { children: ReactNode }) => (
    <h2 className="text-base font-semibold text-slate-900 mt-5 mb-2">{children}</h2>
)
const P = ({ children }: { children: ReactNode }) => (
    <p className="text-sm text-slate-600 leading-relaxed mb-3">{children}</p>
)
const UL = ({ children }: { children: ReactNode }) => (
    <ul className="text-sm text-slate-600 leading-relaxed mb-3 ml-4 list-disc space-y-1">{children}</ul>
)
const OL = ({ children }: { children: ReactNode }) => (
    <ol className="text-sm text-slate-600 leading-relaxed mb-3 ml-4 list-decimal space-y-1">{children}</ol>
)
const LI = ({ children }: { children: ReactNode }) => <li>{children}</li>
const Code = ({ children }: { children: ReactNode }) => (
    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono">{children}</code>
)
const Route = ({ to, children }: { to: string; children: ReactNode }) => (
    <Link to={to} className="text-indigo-600 hover:text-indigo-700 underline font-medium">
        {children}
    </Link>
)

export const HELP_ARTICLES: HelpArticle[] = [
    // ============================================================
    // GETTING STARTED
    // ============================================================
    {
        id: 'first-steps',
        category: 'getting-started',
        title: 'Primeiros passos no WelcomeCRM',
        summary: 'Como configurar sua conta e começar a usar o CRM em 10 minutos',
        searchText: 'primeiro acesso login configuração inicial wizard onboarding passos começar início',
        Content: () => (
            <>
                <P>
                    Bem-vindo ao WelcomeCRM! Este guia vai te ajudar a deixar o sistema pronto para
                    seu time usar.
                </P>

                <H2>1. Configure a identidade da sua empresa</H2>
                <P>
                    Vá em <Route to="/settings/workspace/general">Configurações → Workspace → Geral</Route> e
                    defina nome, logo, cores da marca, moeda e fuso horário. Tudo isso personaliza o CRM
                    visualmente para seu time.
                </P>

                <H2>2. Ajuste seu pipeline de vendas</H2>
                <P>
                    Em <Route to="/settings/pipeline/structure">Configurações → Pipeline → Estrutura</Route> você
                    pode renomear fases, criar novos estágios, definir SLAs e cores. O pipeline padrão tem
                    3 fases (Pré-Venda, Vendas, Pós-Venda) com 9 estágios — adapte ao seu processo.
                </P>

                <H2>3. Customize os campos dos cards</H2>
                <P>
                    Em <Route to="/settings/customization/data-rules">Regras de Dados</Route> você define
                    quais campos aparecem em cada estágio e quais são obrigatórios para avançar. Isso
                    garante que seu time sempre preencha informações críticas.
                </P>

                <H2>4. Convide seu time</H2>
                <P>
                    Em <Route to="/settings/team/members">Equipe → Membros</Route> clique em "Adicionar
                    Usuário", informe email + role, e o convite é enviado automaticamente por email.
                </P>

                <H2>5. Conecte suas integrações</H2>
                <P>
                    ActiveCampaign, WhatsApp, webhooks — em <Route to="/settings/integrations">Integrações</Route> você
                    conecta todas suas ferramentas para sincronizar dados automaticamente.
                </P>
            </>
        ),
        related: ['workspace-general', 'pipeline-edit', 'invite-users'],
    },

    // ============================================================
    // WORKSPACE / BRANDING
    // ============================================================
    {
        id: 'workspace-general',
        category: 'workspace',
        title: 'Personalizar logo, cores e nome da empresa',
        summary: 'White-label completo: logo na sidebar, cores da marca e identidade visual',
        searchText: 'logo cores branding identidade visual white label empresa nome',
        Content: () => (
            <>
                <P>
                    O WelcomeCRM é white-label: você pode personalizar visualmente todo o CRM com a
                    identidade da sua empresa.
                </P>

                <H2>Onde configurar</H2>
                <P>
                    Acesse <Route to="/settings/workspace/general">Configurações → Workspace → Geral</Route>.
                    Apenas administradores podem editar essas configurações.
                </P>

                <H2>O que você pode personalizar</H2>
                <UL>
                    <LI><strong>Nome da empresa</strong> — aparece no título do browser e menus</LI>
                    <LI><strong>Logo</strong> — URL de uma imagem (PNG/SVG, recomendado 200x60px fundo transparente). Aparece na sidebar e no favicon do browser.</LI>
                    <LI><strong>Cor primária e de destaque</strong> — aplicadas em botões, links e elementos de marca</LI>
                    <LI><strong>Moeda padrão</strong> — BRL, USD, EUR</LI>
                    <LI><strong>Fuso horário</strong> — afeta datas e horários exibidos</LI>
                    <LI><strong>Formato de data</strong> — dd/MM/yyyy (BR), MM/dd/yyyy (US), ISO</LI>
                </UL>

                <H2>Dica sobre o logo</H2>
                <P>
                    Use um serviço de hospedagem de imagens (Cloudinary, Imgur, ou um bucket do seu domínio)
                    e cole o link direto da imagem. O WelcomeCRM não hospeda o arquivo, apenas referencia
                    a URL.
                </P>
            </>
        ),
        related: ['first-steps'],
    },

    // ============================================================
    // PIPELINE
    // ============================================================
    {
        id: 'pipeline-edit',
        category: 'pipeline',
        title: 'Editar fases e estágios do pipeline',
        summary: 'Como renomear, criar, deletar e reordenar fases e estágios do seu funil',
        searchText: 'pipeline fases estágios funil kanban renomear criar deletar reordenar',
        Content: () => (
            <>
                <P>
                    O pipeline do WelcomeCRM é organizado em <strong>fases</strong> (Pré-Venda, Vendas, Pós-Venda)
                    que contêm <strong>estágios</strong> individuais. Você pode customizar ambos.
                </P>

                <H2>Acessar o editor</H2>
                <P>
                    Vá em <Route to="/settings/pipeline/structure">Configurações → Pipeline → Estrutura</Route>.
                </P>

                <H2>Criar uma nova fase</H2>
                <P>
                    Clique em "Adicionar fase" no final da lista. Informe o nome (ex: "Onboarding Cliente")
                    e o slug é gerado automaticamente. A nova fase fica no final e pode ser reordenada por
                    drag-and-drop.
                </P>

                <H2>Criar um novo estágio</H2>
                <P>
                    Dentro de cada fase, clique em "Adicionar estágio". Defina o nome e ele é adicionado ao
                    final dessa fase. Você pode arrastar estágios entre fases.
                </P>

                <H2>Editar SLA e propriedades</H2>
                <P>
                    Clique em um estágio para abrir o drawer lateral com opções avançadas: SLA em horas,
                    descrição, se é um estágio terminal (ganho/perdido), cor, e mais.
                </P>

                <H2>Renomear</H2>
                <P>
                    Clique no nome do estágio ou fase para editar inline. As mudanças são salvas
                    automaticamente.
                </P>
            </>
        ),
        related: ['field-config-stage', 'first-steps'],
    },

    // ============================================================
    // FIELD CONFIG
    // ============================================================
    {
        id: 'field-config-stage',
        category: 'field-config',
        title: 'Configurar campos obrigatórios por estágio',
        summary: 'Defina quais campos aparecem e são obrigatórios em cada fase do pipeline',
        searchText: 'campos estágio obrigatório visibilidade formulário customização',
        Content: () => (
            <>
                <P>
                    No WelcomeCRM você controla exatamente quais campos aparecem no formulário do card em
                    cada estágio, e quais são obrigatórios para avançar. Isso garante qualidade dos dados
                    ao longo do funil.
                </P>

                <H2>Acessar o editor</H2>
                <P>
                    Vá em <Route to="/settings/customization/data-rules">Configurações → Personalização → Regras de Dados</Route>.
                </P>

                <H2>Como funciona</H2>
                <P>
                    Para cada combinação <Code>estágio × campo</Code>, você pode definir:
                </P>
                <UL>
                    <LI><strong>Visível</strong> — o campo aparece no formulário</LI>
                    <LI><strong>Obrigatório</strong> — precisa ser preenchido para avançar</LI>
                    <LI><strong>Mostrar no header</strong> — fica em destaque no topo do card</LI>
                    <LI><strong>Label customizado</strong> — sobrescreve o nome padrão do campo só naquele estágio</LI>
                </UL>

                <H2>Campos por seção</H2>
                <P>
                    Campos são agrupados em seções (Informações, Pagamento, Pessoas, etc). Você pode criar
                    novas seções em <Route to="/settings/customization/sections">Seções</Route> e organizar
                    os campos visualmente.
                </P>
            </>
        ),
        related: ['pipeline-edit'],
    },

    // ============================================================
    // USERS
    // ============================================================
    {
        id: 'invite-users',
        category: 'users',
        title: 'Convidar usuários e definir roles',
        summary: 'Como adicionar membros ao time e configurar permissões',
        searchText: 'convidar usuário membro time role permissão convite email',
        Content: () => (
            <>
                <H2>Enviar um convite</H2>
                <OL>
                    <LI>Vá em <Route to="/settings/team/members">Configurações → Equipe → Membros</Route></LI>
                    <LI>Clique em "Adicionar Usuário"</LI>
                    <LI>Informe email, role (papel), time opcional e produtos que o usuário terá acesso</LI>
                    <LI>Clique em "Gerar Link de Convite"</LI>
                </OL>

                <P>
                    O WelcomeCRM envia o email de convite automaticamente. Se por algum motivo o email não
                    sair (ex: servidor de email da sua empresa bloqueia mensagens externas), você pode
                    copiar o link do convite manualmente e enviar por outro canal.
                </P>

                <H2>Roles disponíveis</H2>
                <P>
                    Os roles padrão são: <Code>admin</Code>, <Code>sales</Code>, <Code>support</Code>. Você
                    pode criar roles customizados na aba "Roles" de <Route to="/settings/team/members">Equipe → Membros</Route>.
                    Cada role tem permissões granulares editáveis em uma matriz visual.
                </P>

                <H2>Expiração do convite</H2>
                <P>
                    Convites expiram em 7 dias. Se o convite expirar antes de ser usado, gere um novo.
                </P>
            </>
        ),
        related: ['roles-permissions', 'departments'],
    },
    {
        id: 'roles-permissions',
        category: 'users',
        title: 'Definir permissões granulares por role',
        summary: 'Controle o que cada role pode fazer no sistema — da criação de cards à gestão de integrações',
        searchText: 'role permissão capability granular matriz acesso controle',
        Content: () => (
            <>
                <P>
                    Cada role (papel) tem um conjunto de permissões que define o que o usuário pode fazer.
                    Você pode editar isso visualmente em uma matriz de toggles.
                </P>

                <H2>Onde editar</H2>
                <P>
                    Em <Route to="/settings/team/members">Equipe → Membros</Route>, aba "Roles", clique em
                    um role e vá na aba "Permissões".
                </P>

                <H2>Grupos de permissões</H2>
                <UL>
                    <LI><strong>Pipeline</strong> — ver, criar, editar, mover, deletar cards</LI>
                    <LI><strong>Contatos</strong> — gerenciamento de leads</LI>
                    <LI><strong>Propostas</strong> — criar, editar, enviar</LI>
                    <LI><strong>Equipe</strong> — convidar usuários, gerenciar times, departamentos, roles</LI>
                    <LI><strong>Configuração</strong> — pipeline, campos, seções, tags, workspace</LI>
                    <LI><strong>Automações</strong> — cadências e regras de automação</LI>
                    <LI><strong>Integrações</strong> — conectar AC, WhatsApp, criar API keys</LI>
                    <LI><strong>Analytics</strong> — relatórios e métricas</LI>
                    <LI><strong>Dados e LGPD</strong> — audit log, export de dados</LI>
                </UL>

                <H2>Presets de início rápido</H2>
                <P>
                    Ao criar/editar um role, você pode aplicar um preset (<Code>admin</Code>, <Code>sales</Code>, <Code>support</Code>, <Code>gestor</Code>)
                    para configurar rapidamente as permissões mais comuns.
                </P>

                <H2>Permissões sensíveis</H2>
                <P>
                    Algumas permissões são marcadas como <strong>sensíveis</strong> (convidar usuários, gerenciar
                    integrações, exportar dados). Atribua apenas a pessoas de confiança.
                </P>
            </>
        ),
        related: ['invite-users'],
    },
    {
        id: 'departments',
        category: 'users',
        title: 'Organizar times em departamentos',
        summary: 'Agrupe times por área (Vendas, Pós-Venda, Marketing) para facilitar gestão',
        searchText: 'departamento time equipe organização estrutura hierarquia',
        Content: () => (
            <>
                <P>
                    Departamentos são agrupamentos lógicos de times. Úteis quando você tem múltiplos times
                    em áreas diferentes (ex: Departamento Comercial com times de SDR e Closers).
                </P>

                <H2>Criar um departamento</H2>
                <P>
                    Vá em <Route to="/settings/team/departments">Equipe → Departamentos</Route>. Clique em
                    "Novo departamento", informe nome e descrição opcional. O slug é gerado automaticamente.
                </P>

                <H2>Associar times</H2>
                <P>
                    Na aba "Times" de <Route to="/settings/team/members">Equipe → Membros</Route>, edite um
                    time e selecione o departamento ao qual ele pertence.
                </P>
            </>
        ),
        related: ['invite-users'],
    },

    // ============================================================
    // SECURITY / LGPD
    // ============================================================
    {
        id: 'export-lgpd',
        category: 'security',
        title: 'Exportar todos os dados da organização (LGPD)',
        summary: 'Direito de portabilidade: gere um JSON com todos os dados da sua organização',
        searchText: 'export exportar dados lgpd portabilidade backup json download',
        Content: () => (
            <>
                <P>
                    Conforme Art. 18 da LGPD, você tem direito à portabilidade dos dados. O WelcomeCRM
                    permite exportar todos os dados da sua organização em formato JSON estruturado.
                </P>

                <H2>Como exportar</H2>
                <OL>
                    <LI>Vá em <Route to="/settings/workspace/general">Configurações → Workspace → Geral</Route></LI>
                    <LI>Role até a seção "Privacidade e LGPD"</LI>
                    <LI>Clique em "Exportar dados (LGPD)"</LI>
                    <LI>Um arquivo JSON é baixado automaticamente</LI>
                </OL>

                <H2>O que é exportado</H2>
                <P>
                    Cerca de 30 tabelas da sua organização: contatos, cards, tarefas, propostas, mensagens,
                    times, roles, integrações (com tokens redactados por segurança), audit log dos últimos
                    90 dias, e mais.
                </P>

                <H2>Segurança</H2>
                <UL>
                    <LI>Apenas administradores podem solicitar export (permissão dangerous)</LI>
                    <LI>Tokens de integração são <strong>redactados</strong> no arquivo (aparecem como <Code>[REDACTED]</Code>)</LI>
                    <LI>Cada export é registrado no audit log da organização</LI>
                    <LI>Mantenha o arquivo em local seguro — ele contém dados pessoais de clientes</LI>
                </UL>
            </>
        ),
        related: ['audit-log'],
    },
    {
        id: 'audit-log',
        category: 'security',
        title: 'Consultar o histórico de alterações (Audit Log)',
        summary: 'Veja quem alterou o quê e quando — essencial para compliance e auditoria',
        searchText: 'audit log auditoria histórico alteração mudança log',
        Content: () => (
            <>
                <P>
                    O WelcomeCRM mantém um log completo de alterações em tabelas sensíveis (cards,
                    profiles, configurações, roles, etc.). Apenas administradores têm acesso.
                </P>

                <H2>Onde acessar</H2>
                <P>
                    Em <Route to="/settings/team/members">Equipe → Membros</Route>, aba "Audit Log". Você
                    pode filtrar por usuário, tipo de ação (INSERT/UPDATE/DELETE) e data.
                </P>

                <H2>Retenção</H2>
                <P>
                    O audit log é mantido indefinidamente no banco, mas o export LGPD traz apenas os
                    últimos 90 dias. Para auditorias mais antigas, consulte o admin do sistema.
                </P>
            </>
        ),
        related: ['export-lgpd'],
    },

    // ============================================================
    // NOTIFICATIONS
    // ============================================================
    {
        id: 'email-notifications',
        category: 'notifications',
        title: 'Configurar notificações por email',
        summary: 'Receba alertas por email quando leads são atribuídos, tarefas vencem ou propostas mudam',
        searchText: 'notificação email alerta preferência configurar lead tarefa',
        Content: () => (
            <>
                <P>
                    O WelcomeCRM envia notificações por 3 canais: in-app (sino), push (desktop) e email.
                    Você pode configurar cada canal individualmente.
                </P>

                <H2>Configurar emails</H2>
                <OL>
                    <LI>Vá em <Route to="/settings/profile">Meu Perfil → Notificações</Route></LI>
                    <LI>Role até a seção "Notificações por email"</LI>
                    <LI>Ative o toggle master "Receber emails"</LI>
                    <LI>Escolha os tipos específicos que você quer receber</LI>
                </OL>

                <H2>Tipos disponíveis</H2>
                <UL>
                    <LI><strong>Novo lead atribuído</strong> — quando um card é atribuído a você</LI>
                    <LI><strong>Tarefa próxima do prazo</strong> — alerta antes do vencimento</LI>
                    <LI><strong>Tarefa atrasada</strong> — após passar do prazo</LI>
                    <LI><strong>Lembrete de reunião</strong> — antes de reuniões agendadas</LI>
                    <LI><strong>Proposta atualizada</strong> — quando o status muda</LI>
                </UL>

                <H2>Não estou recebendo emails</H2>
                <P>
                    Verifique: (1) sua caixa de spam, (2) se o domínio do WelcomeCRM não está bloqueado
                    pelo servidor da sua empresa, (3) se o toggle master de email está ativo, (4) se o
                    tipo específico está ativo.
                </P>
            </>
        ),
        related: [],
    },
]
