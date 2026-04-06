import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { TERMS_VERSION, TERMS_DATE } from './versions'

export default function Terms() {
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
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Termos de Uso — WelcomeCRM</h1>
                    <p className="text-xs text-slate-500 mb-8">
                        Versão {TERMS_VERSION} — última atualização: {TERMS_DATE}
                    </p>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">1. Aceitação dos Termos</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Ao criar uma conta ou utilizar o WelcomeCRM, você concorda com estes Termos de Uso e com a Política de
                            Privacidade. Caso discorde de qualquer disposição, não utilize a plataforma.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">2. Descrição do Serviço</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            O WelcomeCRM é uma plataforma SaaS multi-tenant de gestão de relacionamento com clientes (CRM),
                            destinada à organização de pipeline de vendas, contatos, tarefas, integrações e automações comerciais.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">3. Conta e Responsabilidades</h2>
                        <ul className="text-sm text-slate-600 leading-relaxed space-y-1 list-disc pl-5">
                            <li>O usuário é responsável pela confidencialidade de suas credenciais.</li>
                            <li>Cada organização é responsável pelos dados que insere na plataforma.</li>
                            <li>É proibido o uso do serviço para atividades ilegais ou fraudulentas.</li>
                            <li>É proibido tentar acessar dados de outras organizações (multi-tenant isolation).</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">4. Propriedade Intelectual</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Os dados inseridos pela organização permanecem de propriedade da organização. O software, código,
                            design e marca "WelcomeCRM" permanecem de propriedade de seus titulares.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">5. Disponibilidade e SLA</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            A plataforma é oferecida "no estado em que se encontra". Nos esforçamos para manter disponibilidade de
                            99%+, mas não garantimos ausência de interrupções, manutenções programadas ou incidentes.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">6. Limitação de Responsabilidade</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Em nenhuma hipótese o WelcomeCRM será responsável por danos indiretos, lucros cessantes, perda de dados
                            ou outros prejuízos decorrentes do uso ou impossibilidade de uso do serviço.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">7. Encerramento</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Você pode encerrar sua conta a qualquer momento. Reservamos o direito de suspender ou encerrar contas
                            que violem estes Termos. Após encerramento, seus dados poderão ser retidos por até 90 dias antes da
                            exclusão definitiva, conforme política de backup.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">8. Alterações</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Podemos atualizar estes Termos periodicamente. Alterações significativas serão comunicadas por email
                            aos administradores da organização. O uso continuado após a atualização constitui aceitação.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">9. Lei Aplicável</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Estes Termos são regidos pelas leis da República Federativa do Brasil. Foro eleito: São Paulo/SP.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">10. Contato</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Dúvidas? Entre em contato pelo email cadastrado da sua organização com o administrador.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
