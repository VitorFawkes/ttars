/**
 * Templates de email transacional do WelcomeCRM.
 *
 * Cada template é uma função pura que recebe variables e retorna { subject, html, text }.
 * HTML é escrito inline (sem framework de email) para portabilidade.
 * Estilo: fundo branco, bordas suaves, accent indigo, mobile-friendly.
 */

export type TemplateKey = "invite" | "password_reset" | "lead_assigned" | "org_welcome";

export type TemplateVariables = Record<string, string | number | undefined>;

interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

function getAppUrl(): string {
  return Deno.env.get("APP_URL") ?? "https://crm.welcomegroup.com.br";
}

const EMAIL_WRAPPER = (content: string, footerText?: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WelcomeCRM</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 24px 32px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
              ${footerText ?? "Este é um email automático do WelcomeCRM. Não responda a esta mensagem."}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const BUTTON = (href: string, label: string): string => `
<table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td style="background:#4f46e5;border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr>
</table>
`;

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function getTemplate(key: TemplateKey, vars: TemplateVariables): RenderedTemplate {
  const appUrl = getAppUrl();

  switch (key) {
    case "invite": {
      const orgName = escapeHtml(String(vars.org_name ?? "WelcomeCRM"));
      const roleName = escapeHtml(String(vars.role_name ?? "Membro"));
      const token = String(vars.token ?? "");
      const inviterName = escapeHtml(String(vars.inviter_name ?? "Sua equipe"));
      const link = `${appUrl}/invite/${token}`;

      const subject = `Você foi convidado para ${orgName}`;
      const html = EMAIL_WRAPPER(`
        <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#0f172a;">Você foi convidado!</h1>
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#475569;">
          <strong>${inviterName}</strong> convidou você para se juntar à organização <strong>${orgName}</strong> no WelcomeCRM como <strong>${roleName}</strong>.
        </p>
        <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#475569;">
          Clique no botão abaixo para aceitar o convite e criar sua conta:
        </p>
        ${BUTTON(link, "Aceitar convite")}
        <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">
          Se o botão não funcionar, copie este link no navegador:<br>
          <span style="word-break:break-all;color:#64748b;">${link}</span>
        </p>
        <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">
          Este convite expira em 7 dias.
        </p>
      `);
      const text = `Você foi convidado para ${orgName}!\n\n${inviterName} convidou você como ${roleName}.\n\nAceite o convite: ${link}\n\nO link expira em 7 dias.`;

      return { subject, html, text };
    }

    case "password_reset": {
      const link = String(vars.link ?? `${appUrl}/reset-password`);
      const userName = escapeHtml(String(vars.user_name ?? "usuário"));

      const subject = "Recuperação de senha — WelcomeCRM";
      const html = EMAIL_WRAPPER(`
        <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#0f172a;">Recuperação de senha</h1>
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#475569;">
          Olá ${userName},
        </p>
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#475569;">
          Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:
        </p>
        ${BUTTON(link, "Redefinir senha")}
        <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">
          Se você não solicitou esta recuperação, ignore este email. Sua senha permanecerá a mesma.
        </p>
        <p style="margin:8px 0 0 0;font-size:12px;color:#94a3b8;">
          Este link expira em 1 hora.
        </p>
      `);
      const text = `Recuperação de senha\n\nOlá ${userName},\n\nClique no link para redefinir sua senha: ${link}\n\nSe você não solicitou, ignore este email.`;

      return { subject, html, text };
    }

    case "lead_assigned": {
      const cardTitle = escapeHtml(String(vars.card_title ?? "Novo lead"));
      const cardId = String(vars.card_id ?? "");
      const link = `${appUrl}/cards/${cardId}`;
      const assigneeName = escapeHtml(String(vars.assignee_name ?? "você"));

      const subject = `Novo lead atribuído: ${cardTitle}`;
      const html = EMAIL_WRAPPER(`
        <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#0f172a;">Novo lead atribuído</h1>
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#475569;">
          Olá ${assigneeName}, o lead <strong>${cardTitle}</strong> foi atribuído a você.
        </p>
        ${BUTTON(link, "Abrir card")}
      `);
      const text = `Novo lead atribuído: ${cardTitle}\n\nAbrir: ${link}`;

      return { subject, html, text };
    }

    case "org_welcome": {
      const orgName = escapeHtml(String(vars.org_name ?? "sua organização"));
      const adminName = escapeHtml(String(vars.admin_name ?? "admin"));

      const subject = `Bem-vindo ao WelcomeCRM, ${orgName}!`;
      const html = EMAIL_WRAPPER(`
        <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#0f172a;">Bem-vindo ao WelcomeCRM</h1>
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#475569;">
          Olá ${adminName}, a organização <strong>${orgName}</strong> foi criada com sucesso.
        </p>
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#475569;">
          Faça seu primeiro login para configurar o CRM do jeito que sua empresa precisa: logo, pipeline, campos, integrações e muito mais.
        </p>
        ${BUTTON(`${appUrl}/login`, "Acessar WelcomeCRM")}
      `);
      const text = `Bem-vindo ao WelcomeCRM, ${orgName}!\n\n${adminName}, sua organização foi criada. Acesse: ${appUrl}/login`;

      return { subject, html, text };
    }

    default:
      throw new Error(`Template desconhecido: ${key}`);
  }
}
