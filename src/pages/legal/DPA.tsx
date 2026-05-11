import { Link } from 'react-router-dom'
import { ArrowLeft, Download } from 'lucide-react'
import { DPA_VERSION, DPA_DATE } from './versions'

export default function DPA() {
    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-8 md:p-12">
                <div className="flex items-center justify-between mb-6">
                    <Link
                        to="/login"
                        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Voltar
                    </Link>

                    <button
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700"
                    >
                        <Download className="w-4 h-4" />
                        Imprimir / Salvar PDF
                    </button>
                </div>

                <div className="prose prose-slate max-w-none">
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">
                        Data Processing Agreement (DPA) — WelcomeCRM
                    </h1>
                    <p className="text-xs text-slate-500 mb-8">
                        Versão {DPA_VERSION} — última atualização: {DPA_DATE}
                    </p>

                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                        Este Data Processing Agreement ("DPA") complementa os Termos de Uso do WelcomeCRM e estabelece as
                        obrigações das partes quanto ao tratamento de dados pessoais, em conformidade com a Lei Geral de
                        Proteção de Dados — LGPD (Lei 13.709/2018) e, quando aplicável, com o Regulamento Geral de Proteção
                        de Dados — GDPR (Regulamento UE 2016/679).
                    </p>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">1. Definições</h2>
                        <ul className="text-sm text-slate-600 leading-relaxed space-y-1 list-disc pl-5">
                            <li><strong>Controlador:</strong> a Organização contratante do WelcomeCRM, responsável pelas decisões sobre o tratamento dos Dados Pessoais.</li>
                            <li><strong>Operador:</strong> WelcomeCRM, que trata os Dados Pessoais por conta e por instrução do Controlador.</li>
                            <li><strong>Dados Pessoais:</strong> qualquer informação relacionada a pessoa natural identificada ou identificável inserida na plataforma.</li>
                            <li><strong>Titular:</strong> pessoa natural a quem se referem os Dados Pessoais.</li>
                            <li><strong>Sub-operador:</strong> terceiro contratado pelo Operador para prestar serviços que envolvem tratamento de Dados Pessoais.</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">2. Objeto e Escopo</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            O Operador tratará Dados Pessoais exclusivamente para fins de prestação do serviço de CRM,
                            conforme instruções documentadas pelo Controlador. O escopo inclui: contatos comerciais,
                            dados de clientes, histórico de interações, mensagens, tarefas, propostas, cards do pipeline
                            e metadados associados.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">3. Obrigações do Operador</h2>
                        <ul className="text-sm text-slate-600 leading-relaxed space-y-1 list-disc pl-5">
                            <li>Tratar os Dados Pessoais apenas conforme as instruções do Controlador.</li>
                            <li>Manter confidencialidade dos Dados Pessoais e exigir o mesmo de seus colaboradores.</li>
                            <li>Implementar medidas técnicas e organizacionais adequadas (TLS 1.3, RLS, criptografia at-rest, logs de auditoria).</li>
                            <li>Notificar o Controlador em até 48 horas após detecção de incidente de segurança que afete Dados Pessoais.</li>
                            <li>Auxiliar o Controlador no atendimento de requisições de Titulares (Art. 18 LGPD).</li>
                            <li>Devolver ou eliminar os Dados Pessoais ao término do contrato, em até 90 dias.</li>
                        </ul>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">4. Sub-operadores Autorizados</h2>
                        <p className="text-sm text-slate-600 leading-relaxed mb-2">
                            O Controlador autoriza o Operador a contratar os seguintes Sub-operadores:
                        </p>
                        <table className="text-sm text-slate-600 border border-slate-200 rounded w-full">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="text-left p-2 border-b border-slate-200 font-semibold">Sub-operador</th>
                                    <th className="text-left p-2 border-b border-slate-200 font-semibold">Finalidade</th>
                                    <th className="text-left p-2 border-b border-slate-200 font-semibold">Localização</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="p-2 border-b border-slate-100">Supabase Inc.</td>
                                    <td className="p-2 border-b border-slate-100">Banco de dados e autenticação</td>
                                    <td className="p-2 border-b border-slate-100">EUA (us-east-2)</td>
                                </tr>
                                <tr>
                                    <td className="p-2 border-b border-slate-100">Vercel Inc.</td>
                                    <td className="p-2 border-b border-slate-100">Hosting de frontend</td>
                                    <td className="p-2 border-b border-slate-100">EUA/Global</td>
                                </tr>
                                <tr>
                                    <td className="p-2">Resend</td>
                                    <td className="p-2">Email transacional</td>
                                    <td className="p-2">EUA</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-xs text-slate-500 leading-relaxed mt-2">
                            Alterações na lista de sub-operadores serão comunicadas ao Controlador com 30 dias de antecedência.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">5. Transferência Internacional</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            O Controlador reconhece e autoriza a transferência de Dados Pessoais para os Sub-operadores localizados
                            fora do território nacional, em conformidade com o Art. 33 da LGPD, mediante garantias contratuais
                            equivalentes ao nível de proteção da LGPD.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">6. Auditoria</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            O Controlador poderá, mediante aviso prévio de 30 dias, auditar o cumprimento deste DPA, limitado
                            a uma vez por ano, exceto em caso de incidente de segurança. O Operador disponibilizará logs de
                            auditoria e documentação técnica relevante.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">7. Encerramento e Devolução de Dados</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Ao término do contrato, o Controlador poderá solicitar a exportação completa dos Dados Pessoais em
                            formato estruturado (JSON/CSV) no prazo de até 30 dias. Após 90 dias do encerramento, os Dados
                            Pessoais serão eliminados de todos os backups do Operador.
                        </p>
                    </section>

                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">8. Responsabilidade</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Cada parte é responsável pelo cumprimento de suas obrigações conforme LGPD. O Operador não é
                            responsável pelo conteúdo dos Dados Pessoais inseridos pelo Controlador, nem pela legitimidade da
                            base legal para seu tratamento, que é de exclusiva responsabilidade do Controlador.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">9. Vigência</h2>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Este DPA tem vigência enquanto perdurar a relação contratual entre as partes. Em caso de conflito
                            entre este DPA e os Termos de Uso, prevalecerá este DPA quanto a questões de tratamento de dados
                            pessoais.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
