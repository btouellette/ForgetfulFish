import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

  return {
    sendMail: sendMailMock,
    createTransport: createTransportMock
  };
});

vi.mock("nodemailer", () => ({
  createTransport
}));

import { sendMagicLinkEmail } from "./magic-link-email";

describe("sendMagicLinkEmail", () => {
  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockClear();
  });

  it("sends a magic-link email using configured smtp server", async () => {
    sendMail.mockResolvedValueOnce(undefined);

    await sendMagicLinkEmail({
      authEmailFrom: "Forgetful Fish <noreply@forgetfulfish.com>",
      authEmailServer: "smtp://localhost:1025",
      identifier: "player@example.com",
      url: "https://forgetfulfish.com/api/auth/callback/email?token=abc123"
    });

    expect(createTransport).toHaveBeenCalledWith("smtp://localhost:1025");
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Forgetful Fish <noreply@forgetfulfish.com>",
        to: "player@example.com",
        subject: "Sign in to Forgetful Fish"
      })
    );
  });

  it("logs sanitized details and rethrows when smtp send fails", async () => {
    const smtpError = new Error("535 Invalid login");
    sendMail.mockRejectedValueOnce(smtpError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      sendMagicLinkEmail({
        authEmailFrom: "Forgetful Fish <noreply@forgetfulfish.com>",
        authEmailServer: "smtp://localhost:1025",
        identifier: "player@example.com",
        url: "https://forgetfulfish.com/api/auth/callback/email?token=super-secret-token"
      })
    ).rejects.toThrow("535 Invalid login");

    expect(consoleError).toHaveBeenCalledWith(
      "Magic-link email send failed",
      expect.objectContaining({
        email: "p***r@example.com",
        reason: "535 Invalid login"
      })
    );

    const logCall = consoleError.mock.calls.at(0);
    expect(logCall?.[1]).not.toHaveProperty("url");
    expect(logCall?.[1]).not.toHaveProperty("token");

    consoleError.mockRestore();
  });
});
