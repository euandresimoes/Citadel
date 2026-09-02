import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import ButtonPrimary from "../../../components/@citadela/base/buttons/ButtonPrimary";
import ConfirmationDialog from "../../../components/@citadela/composed/dialogs/ConfirmationDialog";
import { hubApi, type HubProfile, type TotpEnrollment } from "../../../services/@citadela/hub/hubApi";
import "./ProfileSettingsView.scss";

function fileAsDataUrl(event: ChangeEvent<HTMLInputElement>): void {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => window.dispatchEvent(new CustomEvent("citadela:avatar", { detail: reader.result }));
  reader.readAsDataURL(file);
}

export default function ProfileSettingsView() {
  const [profile, setProfile] = useState<HubProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [token, setToken] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);

  useEffect(() => { void hubApi.getProfile().then((value) => { setProfile(value); setDisplayName(value.displayName); setAvatarBase64(value.avatarBase64); }).catch(showError); }, []);
  useEffect(() => { const handler = (event: Event) => setAvatarBase64((event as CustomEvent<string>).detail); window.addEventListener("citadela:avatar", handler); return () => window.removeEventListener("citadela:avatar", handler); }, []);

  function showError(cause: unknown) { setError(cause instanceof Error ? cause.message : "Request failed"); }
  async function saveProfile(event: FormEvent) { event.preventDefault(); setError(null); setMessage(null); try { const value = await hubApi.updateProfile({ displayName, avatarBase64 }); setProfile(value); setMessage("Profile saved."); } catch (cause) { showError(cause); } }
  async function startTotp() { setError(null); try { setEnrollment(await hubApi.beginTotpEnrollment()); } catch (cause) { showError(cause); } }
  async function confirmTotp(event: FormEvent) { event.preventDefault(); setError(null); try { const result = await hubApi.confirmTotpEnrollment(token); setRecoveryCodes(result.recoveryCodes); setEnrollment(null); if (profile) setProfile({ ...profile, totpEnabled: true }); setToken(""); } catch (cause) { showError(cause); } }
  async function changePassword(event: FormEvent) { event.preventDefault(); setError(null); try { await hubApi.changePassword(currentPassword, newPassword); setCurrentPassword(""); setNewPassword(""); setMessage("Password changed."); } catch (cause) { showError(cause); } }

  if (!profile) return <main className="profile-settings"><p>Loading profile…</p></main>;
  return <main className="profile-settings">
    <h2>Profile settings</h2>
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}
    <form onSubmit={saveProfile}><h3>Profile</h3><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Avatar<input type="file" accept="image/png,image/jpeg,image/webp" onChange={fileAsDataUrl} /></label>{avatarBase64 ? <img className="profile-settings__avatar" src={avatarBase64} alt="Profile avatar preview" /> : null}<ButtonPrimary type="submit">Save profile</ButtonPrimary></form>
    <form onSubmit={changePassword}><h3>Password</h3><label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label>New password<input type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><ButtonPrimary type="submit">Change password</ButtonPrimary></form>
    <section><h3>OTP authentication</h3>{profile.totpEnabled ? <p>OTP is enabled. Disable it only with your password.</p> : <ButtonPrimary type="button" onClick={() => void startTotp()}>Enable OTP</ButtonPrimary>}{enrollment ? <form onSubmit={confirmTotp}><img src={enrollment.qrCodeDataUrl} alt="OTP enrollment QR code" /><p>Scan the QR code with your authenticator, then enter the six-digit code.</p><code>{enrollment.otpauthUri}</code><input inputMode="numeric" pattern="[0-9]{6}" value={token} onChange={(event) => setToken(event.target.value)} required /><ButtonPrimary type="submit">Confirm OTP</ButtonPrimary></form> : null}</section>
    {recoveryCodes.length ? <section role="alert"><h3>Save your recovery codes</h3><p>These are shown once. Store them securely.</p><pre>{recoveryCodes.join("\n")}</pre></section> : null}
    {profile.totpEnabled ? <><ButtonPrimary type="button" onClick={() => setDisableDialogOpen(true)}>Disable OTP</ButtonPrimary><ConfirmationDialog open={disableDialogOpen} title="Disable OTP" message="Disable OTP authentication? Your current password is required." confirmLabel="Disable OTP" onCancel={() => setDisableDialogOpen(false)} onConfirm={async () => { await hubApi.disableTotp(currentPassword); setCurrentPassword(""); setProfile({ ...profile, totpEnabled: false }); setDisableDialogOpen(false); }} /></> : null}
  </main>;
}
