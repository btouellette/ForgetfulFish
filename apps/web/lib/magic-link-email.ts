import { createTransport } from "nodemailer";

type SendMagicLinkEmailInput = {
  authEmailFrom: string;
  authEmailServer: string;
  identifier: string;
  url: string;
};

export async function sendMagicLinkEmail({
  authEmailFrom,
  authEmailServer,
  identifier,
  url
}: SendMagicLinkEmailInput) {
  const redactedEmail = redactEmail(identifier);
  const smtpHost = getSmtpHost(authEmailServer);

  console.info("Magic-link email send started", {
    email: redactedEmail,
    smtpHost
  });

  try {
    const transport = createTransport(authEmailServer);
    await transport.sendMail({
      from: authEmailFrom,
      to: identifier,
      subject: "Sign in to Forgetful Fish",
      text: `Sign in to Forgetful Fish: ${url}`,
      html: `<p>Sign in to Forgetful Fish:</p><p><a href="${url}">${url}</a></p>`
    });

    console.info("Magic-link email send succeeded", {
      email: redactedEmail,
      smtpHost
    });
  } catch (error) {
    console.error("Magic-link email send failed", {
      email: redactedEmail,
      smtpHost,
      reason: getErrorReason(error)
    });
    throw error;
  }
}

function redactEmail(email: string) {
  const separatorIndex = email.indexOf("@");

  if (separatorIndex <= 0 || separatorIndex === email.length - 1) {
    return "redacted";
  }

  const localPart = email.slice(0, separatorIndex);
  const domain = email.slice(separatorIndex + 1);

  if (localPart.length < 2 || domain.length === 0) {
    return "redacted";
  }

  return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
}

function getErrorReason(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "unknown-error";
}

function getSmtpHost(authEmailServer: string) {
  try {
    const parsed = new URL(authEmailServer);
    return parsed.hostname;
  } catch {
    return "invalid-smtp-url";
  }
}
