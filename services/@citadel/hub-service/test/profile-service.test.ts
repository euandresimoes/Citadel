import { describe, expect, it } from "vitest";
import { generate } from "otplib";
import { InMemoryProfileRepository, InvalidCredentialsError, ProfileAuthenticationService, ProfileAlreadyConfiguredError } from "../src/auth/profile-service.js";

const key = Buffer.alloc(32, 7);
const png = "data:image/png;base64,iVBORw0KGgo=";

describe("ProfileAuthenticationService", () => {
  it("creates one local profile with a strong password hash and default display name", async () => {
    const repository = new InMemoryProfileRepository();
    const service = new ProfileAuthenticationService(repository, key);
    const profile = await service.createProfile({ password: "a-very-strong-password" , avatarBase64: png });
    expect(profile.displayName).toBe("Admin");
    expect(profile.passwordHash).not.toContain("a-very-strong-password");
    await expect(service.createProfile({ password: "another-very-strong-password" })).rejects.toBeInstanceOf(ProfileAlreadyConfiguredError);
  });

  it("rejects weak and forged avatars", async () => {
    const service = new ProfileAuthenticationService(new InMemoryProfileRepository(), key);
    await expect(service.createProfile({ password: "short" })).rejects.toThrow("12 characters");
    await expect(service.createProfile({ password: "a-very-strong-password", avatarBase64: "data:image/png;base64,ZmFrZQ==" })).rejects.toThrow("content");
  });

  it("enrolls TOTP and consumes recovery codes only once", async () => {
    const service = new ProfileAuthenticationService(new InMemoryProfileRepository(), key);
    await service.createProfile({ password: "a-very-strong-password" });
    const enrollment = await service.beginTotpEnrollment();
    const secret = new URL(enrollment.otpauthUri).searchParams.get("secret");
    expect(secret).toBeTruthy();
    const recoveryCodes = await service.confirmTotpEnrollment(await generate({ secret: secret! }));
    expect(recoveryCodes).toHaveLength(8);
    expect((await service.authenticate("otp", await generate({ secret: secret! }))).actorId).toBe("local-profile");
    expect((await service.authenticate("otp", recoveryCodes[0]!)).actorId).toBe("local-profile");
    await expect(service.authenticate("otp", recoveryCodes[0]!)).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect((await service.authenticate("password", "a-very-strong-password")).actorId).toBe("local-profile");
  });
});
