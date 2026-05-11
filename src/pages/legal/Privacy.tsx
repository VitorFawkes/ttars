import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PRIVACY_VERSION, PRIVACY_DATE } from './versions'

export default function Privacy() {
    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-8 md:p-12">
                <Link
                    to="/login"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar
                </Link>

                <div className="prose prose-slate max-w-none">
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Política de Privacidade — WelcomeCRM</h1>
                    <p className="text-xs text-slate-500 mb-8">
                        Versão {PRIVACY_VERSION} — última atualização: {PRIVACY_DATE} — conforme LGPD (Lei 13.709/2018)
                    </p>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">1. Dados que coletamos</h2>
                        <ul className="text-sm text-slate-600 leading-relaxed space-y-1 list-disc pl-5">
                            <li><strong>Dados de conta:</strong> nome, email, senha (hash), telefone.</li>
                            <li><strong>Dados de uso:</strong> logs de acesso, IP, user-agent, ações no sistema.</li>
                            <li><strong>Dados inseridos pela sua organização:</strong> contatos, cards, tarefas, mensagens.</li>
                            <li><strong>Cookies técnicos:</strong> sessão, preferências, autenticação.</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">2. Finalidades do tratamento</h2>
                        <ul className="text-sm text-slate-600 leading-relaxed space-y-1 list-disc pl-5">
                            <li>Prestar o serviço de CRM conforme contratado pela organização.</li>
                            <li>Autenticar usuários e manter a segurança da plataforma.</li>
                            <li>Enviar notificações transacionais (convites, reset de senha, alertas).</li>
                            <li>Auditoria interna e compliance (retenção de logs por 90 dias).</li>
                            <li>Melhoria contínua do produto (dados agregados e anonimizados).</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">3. Base legal</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            O tratamento de dados pessoais é realizado com base em: (i) execução de contrato (Art. 7º, V da LGPD),
                            (ii) legítimo interesse para segurança e auditoria (Art. 7º, IX), e (iii) consentimento do titular
                            quando aplicável.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">4. Controlador e Operador</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            <strong>Sua organização</strong> é a Controladora dos dados que insere no WelcomeCRM (contatos, cards,
                            mensagens). O <strong>WelcomeCRM</strong> atua como Operador desses dados, processando-os conforme as
                            instruções da Controladora. Para dados de conta (usuários da plataforma), o WelcomeCRM atua como
                            Controlador.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">5. Compartilhamento</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Seus dados são compartilhados apenas com sub-operadores contratados para infraestrutura:
                        </p>
                        <ul className="text-sm text-slate-600 leading-relaxed space-y-1 list-disc pl-5 mt-2">
                            <li><strong>Supabase Inc.</strong> (hosting de banco de dados e autenticação)</li>
                            <li><strong>Vercel Inc.</strong> (hosting de frontend)</li>
                            <li><strong>Resend</strong> (envio de emails transacionais)</li>
                            <li>Integrações configuradas pela própria organização (ex: ActiveCampaign, WhatsApp)</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">6. Retenção</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Dados ativos: enquanto a organização mantiver conta ativa. Dados após encerramento: até 90 dias em
                            backups antes da exclusão definitiva. Logs de auditoria: 90 dias.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">7. Seus direitos (Art. 18 da LGPD)</h2>
                        <p className="text-sm text-slate-600 leading-relaxed mb-2">
                            Você tem direito a:
                        </p>
                        <ul className="text-sm text-slate-600 leading-relaxed space-y-1 list-disc pl-5">
                            <li>Confirmação da existência de tratamento dos seus dados</li>
                            <li>Acesso aos dados (exportação)</li>
                            <li>Correção de dados incompletos ou desatualizados</li>
                            <li>Anonimização, bloqueio ou eliminação</li>
                            <li>Portabilidade para outro fornecedor</li>
                            <li>Eliminação dos dados tratados com consentimento</li>
                            <li>Informação sobre compartilhamento com terceiros</li>
                            <li>Revogação do consentimento</li>
                        </ul>
                        <p className="text-sm text-slate-600 leading-relaxed mt-2">
                            Para exercer esses direitos, solicite através do admin da sua organização ou use a função
                            "Exportar meus dados" em Configurações do Perfil.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">8. Segurança</h2>
                        <ul className="text-sm text-slate-600 leading-relaxed space-y-1 list-disc pl-5">
                            <li>Criptografia em trânsito (TLS 1.3)</li>
                            <li>Senhas armazenadas com hash bcrypt</li>
                            <li>Row-Level Security (RLS) para isolamento multi-tenant</li>
                            <li>Logs de auditoria de alterações sensíveis</li>
                            <li>Backup diário</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">9. Encarregado (DPO)</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Dúvidas sobre tratamento de dados? Entre em contato com o Encarregado de Dados (DPO) da sua
                            organização, que é o administrador cadastrado no WelcomeCRM.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
