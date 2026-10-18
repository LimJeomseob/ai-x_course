import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { REPLY_TO, SENDER_NAME } from "./templates";

/**
 * Gmail SMTP 발송(PRD §9.1). OAuth2(GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN)가 있으면 우선 사용하고,
 * 없으면 앱 비밀번호(GMAIL_APP_PASSWORD)로 인증한다.
 */
let transporter: Transporter | null = null;

export function isMailerConfigured(): boolean {
  const env = process.env;
  return Boolean(
    env.GMAIL_USER &&
      ((env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN) || env.GMAIL_APP_PASSWORD)
  );
}

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const env = process.env;
  if (!isMailerConfigured()) {
    throw new Error("Gmail 발송 환경변수(GMAIL_USER + OAuth2 또는 GMAIL_APP_PASSWORD)가 설정되지 않았습니다.");
  }

  transporter =
    env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN
      ? nodemailer.createTransport({
          service: "gmail",
          auth: {
            type: "OAuth2",
            user: env.GMAIL_USER,
            clientId: env.GMAIL_CLIENT_ID,
            clientSecret: env.GMAIL_CLIENT_SECRET,
            refreshToken: env.GMAIL_REFRESH_TOKEN,
          },
        })
      : nodemailer.createTransport({
          service: "gmail",
          auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
        });
  return transporter;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendOnce(mail: OutgoingMail): Promise<void> {
  await getTransporter().sendMail({
    from: { name: SENDER_NAME, address: process.env.GMAIL_USER! },
    replyTo: REPLY_TO,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}

/** 발송 실패 시 즉시 1회 재시도한다(PRD §9.2). 최종 실패면 마지막 오류를 던진다. */
export async function sendMailWithRetry(mail: OutgoingMail): Promise<void> {
  try {
    await sendOnce(mail);
  } catch {
    await sendOnce(mail);
  }
}
