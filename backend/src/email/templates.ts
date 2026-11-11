import type { EmailKind, Locale } from './types.js';

type Copy = {
  subject: string;
  /** Paragraph before the code (or the whole message for notice kinds). */
  intro: string;
  /** Paragraph after the code (validity + safety advice). Optional. */
  outro?: string;
};

const BRAND = 'Deep Blue Lure';

const COPY: Record<EmailKind, Record<Locale, Copy>> = {
  verify_email_code: {
    pt: {
      subject: 'Confirme o seu email - Deep Blue Lure',
      intro: 'Confirme o seu email para o Deep Blue Lure. Este é o seu código:',
      outro:
        'O código é válido durante {minutes} minutos. Se não criou uma conta, ignore este email.',
    },
    en: {
      subject: 'Confirm your email - Deep Blue Lure',
      intro: 'Confirm your email for Deep Blue Lure. Here is your code:',
      outro:
        "The code is valid for {minutes} minutes. If you didn't create an account, ignore this email.",
    },
    es: {
      subject: 'Confirma tu correo - Deep Blue Lure',
      intro: 'Confirma tu correo electrónico para Deep Blue Lure. Este es tu código:',
      outro:
        'El código es válido durante {minutes} minutos. Si no creaste una cuenta, ignora este correo.',
    },
    fr: {
      subject: 'Confirmez votre e-mail - Deep Blue Lure',
      intro: 'Confirmez votre adresse e-mail pour Deep Blue Lure. Voici votre code :',
      outro:
        "Le code est valable {minutes} minutes. Si vous n'avez pas créé de compte, ignorez cet e-mail.",
    },
    de: {
      subject: 'Bestätige deine E-Mail-Adresse - Deep Blue Lure',
      intro: 'Bestätige deine E-Mail-Adresse für Deep Blue Lure. Dein Code lautet:',
      outro:
        'Der Code ist {minutes} Minuten lang gültig. Falls du kein Konto erstellt hast, ignoriere diese E-Mail.',
    },
    ja: {
      subject: 'メールアドレスの確認 - Deep Blue Lure',
      intro: 'Deep Blue Lure のメールアドレスを確認してください。確認コードはこちらです:',
      outro:
        'このコードの有効期限は{minutes}分です。アカウントを作成していない場合は、このメールを無視してください。',
    },
  },
  login_code: {
    pt: {
      subject: 'O seu código de acesso - Deep Blue Lure',
      intro: 'Este é o seu código para entrar no Deep Blue Lure:',
      outro:
        'O código é válido durante {minutes} minutos. Se não foi você, altere a sua palavra-passe.',
    },
    en: {
      subject: 'Your sign-in code - Deep Blue Lure',
      intro: 'Here is your code to sign in to Deep Blue Lure:',
      outro:
        "The code is valid for {minutes} minutes. If it wasn't you, change your password.",
    },
    es: {
      subject: 'Tu código de acceso - Deep Blue Lure',
      intro: 'Este es tu código para iniciar sesión en Deep Blue Lure:',
      outro:
        'El código es válido durante {minutes} minutos. Si no fuiste tú, cambia tu contraseña.',
    },
    fr: {
      subject: 'Votre code de connexion - Deep Blue Lure',
      intro: 'Voici votre code pour vous connecter à Deep Blue Lure :',
      outro:
        "Le code est valable {minutes} minutes. Si ce n'était pas vous, changez votre mot de passe.",
    },
    de: {
      subject: 'Dein Anmeldecode - Deep Blue Lure',
      intro: 'Hier ist dein Code zur Anmeldung bei Deep Blue Lure:',
      outro:
        'Der Code ist {minutes} Minuten lang gültig. Falls du das nicht warst, ändere dein Passwort.',
    },
    ja: {
      subject: 'ログインコード - Deep Blue Lure',
      intro: 'Deep Blue Lure にログインするためのコードはこちらです:',
      outro:
        'このコードの有効期限は{minutes}分です。心当たりがない場合は、パスワードを変更してください。',
    },
  },
  password_reset_code: {
    pt: {
      subject: 'Redefinir a palavra-passe - Deep Blue Lure',
      intro: 'Use este código para redefinir a sua palavra-passe do Deep Blue Lure:',
      outro:
        'O código é válido durante {minutes} minutos. Se não fez este pedido, ignore este email: a sua palavra-passe mantém-se igual.',
    },
    en: {
      subject: 'Reset your password - Deep Blue Lure',
      intro: 'Use this code to reset your Deep Blue Lure password:',
      outro:
        "The code is valid for {minutes} minutes. If you didn't ask for this, ignore this email: your password stays the same.",
    },
    es: {
      subject: 'Restablece tu contraseña - Deep Blue Lure',
      intro: 'Usa este código para restablecer tu contraseña de Deep Blue Lure:',
      outro:
        'El código es válido durante {minutes} minutos. Si no lo pediste, ignora este correo: tu contraseña no cambiará.',
    },
    fr: {
      subject: 'Réinitialisez votre mot de passe - Deep Blue Lure',
      intro: 'Utilisez ce code pour réinitialiser votre mot de passe Deep Blue Lure :',
      outro:
        "Le code est valable {minutes} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.",
    },
    de: {
      subject: 'Passwort zurücksetzen - Deep Blue Lure',
      intro: 'Verwende diesen Code, um dein Deep-Blue-Lure-Passwort zurückzusetzen:',
      outro:
        'Der Code ist {minutes} Minuten lang gültig. Falls du das nicht angefordert hast, ignoriere diese E-Mail: Dein Passwort bleibt unverändert.',
    },
    ja: {
      subject: 'パスワードの再設定 - Deep Blue Lure',
      intro: 'Deep Blue Lure のパスワードを再設定するためのコードはこちらです:',
      outro:
        'このコードの有効期限は{minutes}分です。リクエストした覚えがない場合は、このメールを無視してください。パスワードは変更されません。',
    },
  },
  register_attempt_notice: {
    pt: {
      subject: 'Tentativa de registo - Deep Blue Lure',
      intro:
        'Alguém tentou criar uma conta no Deep Blue Lure com este email, que já tem uma conta. Se foi você, inicie sessão ou use "Esqueci-me da palavra-passe".',
    },
    en: {
      subject: 'Sign-up attempt - Deep Blue Lure',
      intro:
        'Someone tried to create a Deep Blue Lure account with this email, which already has an account. If it was you, sign in or use "Forgot password".',
    },
    es: {
      subject: 'Intento de registro - Deep Blue Lure',
      intro:
        'Alguien intentó crear una cuenta de Deep Blue Lure con este correo, que ya tiene una cuenta. Si fuiste tú, inicia sesión o usa "Olvidé mi contraseña".',
    },
    fr: {
      subject: "Tentative d'inscription - Deep Blue Lure",
      intro:
        'Quelqu\'un a tenté de créer un compte Deep Blue Lure avec cette adresse e-mail, qui possède déjà un compte. Si c\'était vous, connectez-vous ou utilisez « Mot de passe oublié ».',
    },
    de: {
      subject: 'Registrierungsversuch - Deep Blue Lure',
      intro:
        'Jemand hat versucht, mit dieser E-Mail-Adresse ein Deep-Blue-Lure-Konto zu erstellen, für die bereits ein Konto existiert. Falls du das warst, melde dich an oder nutze "Passwort vergessen".',
    },
    ja: {
      subject: '新規登録の試行 - Deep Blue Lure',
      intro:
        'このメールアドレスで Deep Blue Lure のアカウントを作成しようとした人がいますが、すでにアカウントが存在します。ご本人の場合は、ログインするか「パスワードを忘れた場合」をご利用ください。',
    },
  },
  code_expired_notice: {
    pt: {
      subject: 'O seu código expirou - Deep Blue Lure',
      intro:
        'O código que pediu expirou antes de poder ser entregue. Peça um novo código na aplicação.',
    },
    en: {
      subject: 'Your code expired - Deep Blue Lure',
      intro:
        'The code you asked for expired before it could be delivered. Request a new one in the app.',
    },
    es: {
      subject: 'Tu código ha caducado - Deep Blue Lure',
      intro:
        'El código que pediste caducó antes de poder entregarse. Solicita uno nuevo en la aplicación.',
    },
    fr: {
      subject: 'Votre code a expiré - Deep Blue Lure',
      intro:
        "Le code que vous avez demandé a expiré avant de pouvoir être livré. Demandez-en un nouveau dans l'application.",
    },
    de: {
      subject: 'Dein Code ist abgelaufen - Deep Blue Lure',
      intro:
        'Der von dir angeforderte Code ist abgelaufen, bevor er zugestellt werden konnte. Fordere in der App einen neuen an.',
    },
    ja: {
      subject: 'コードの有効期限が切れました - Deep Blue Lure',
      intro:
        'リクエストされたコードは、配信される前に有効期限が切れました。アプリで新しいコードをリクエストしてください。',
    },
  },
};

const CODE_KINDS: ReadonlySet<EmailKind> = new Set<EmailKind>([
  'verify_email_code',
  'login_code',
  'password_reset_code',
]);

function fill(template: string, payload: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => payload[key] ?? match);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmail(
  kind: EmailKind,
  locale: Locale,
  payload: Record<string, string>,
): { subject: string; text: string; html: string } {
  const copy = COPY[kind][locale];
  const hasCode = CODE_KINDS.has(kind);
  const code = payload.code ?? '';

  const intro = fill(copy.intro, payload);
  const outro = copy.outro ? fill(copy.outro, payload) : undefined;

  const textParts = [intro];
  if (hasCode) textParts.push(code);
  if (outro) textParts.push(outro);
  const text = `${textParts.join('\n\n')}\n\n-- ${BRAND}\n`;

  // Escape every payload-derived value, including those substituted into the copy.
  const escapedPayload = Object.fromEntries(
    Object.entries(payload).map(([k, v]) => [k, escapeHtml(v)]),
  );
  const p = 'margin:0 0 16px;font-size:16px;line-height:1.5;color:#1b2a3a;';
  const htmlParts = [`<p style="${p}">${fill(escapeHtml(copy.intro), escapedPayload)}</p>`];
  if (hasCode) {
    htmlParts.push(
      `<p style="margin:0 0 16px;padding:12px 16px;font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;font-family:Consolas,'Courier New',monospace;background:#e8f1fa;color:#0b3d66;border-radius:6px;">${escapeHtml(code)}</p>`,
    );
  }
  if (copy.outro) {
    htmlParts.push(`<p style="${p}">${fill(escapeHtml(copy.outro), escapedPayload)}</p>`);
  }

  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(copy.subject)}</title></head>` +
    `<body style="margin:0;padding:24px;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;">` +
    `<div style="max-width:480px;margin:0 auto;padding:24px;background:#ffffff;border-radius:8px;">` +
    `<h1 style="margin:0 0 16px;font-size:20px;color:#0b3d66;">${BRAND}</h1>` +
    htmlParts.join('') +
    `</div></body></html>`;

  return { subject: copy.subject, text, html };
}
