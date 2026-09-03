import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import ButtonPrimary from "../../../components/@citadela/base/buttons/ButtonPrimary";
import LayerCard from "../../../components/@citadela/base/cards/LayerCard";
import ConfirmationDialog from "../../../components/@citadela/composed/dialogs/ConfirmationDialog";
import { hubApi, type HubProfile, type TotpEnrollment } from "../../../services/@citadela/hub/hubApi";

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

  if (!profile) return <main className="text-xs text-muted">Loading profile…</main>;
  return <main className="flex min-w-0 flex-col gap-6">
    <h2 className="sr-only">Profile settings</h2>
    {message ? <p className="text-xs text-emerald-400" role="status">{message}</p> : null}{error ? <p className="text-xs text-red-300" role="alert">{error}</p> : null}
    <LayerCard title="Profile"><form className="flex flex-col gap-4" onSubmit={saveProfile}><label className="ui-field"><span className="ui-label">Display name</span><input className="ui-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label className="ui-field"><span className="ui-label">Avatar</span><input className="text-xs text-muted" type="file" accept="image/png,image/jpeg,image/webp" onChange={fileAsDataUrl} /></label>{avatarBase64 ? <img className="size-20 rounded-full border border-line object-cover" src={avatarBase64} alt="Profile avatar preview" /> : null}<ButtonPrimary type="submit">Save profile</ButtonPrimary></form></LayerCard>
    <LayerCard title="Password"><form className="flex flex-col gap-4" onSubmit={changePassword}><label className="ui-field"><span className="ui-label">Current password</span><input className="ui-input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label className="ui-field"><span className="ui-label">New password</span><input className="ui-input" type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><ButtonPrimary type="submit">Change password</ButtonPrimary></form></LayerCard>
    <LayerCard title="OTP authentication"><div className="flex flex-col gap-4">{profile.totpEnabled ? <p className="text-xs text-muted">OTP is enabled. Disable it only with your password.</p> : <ButtonPrimary type="button" onClick={() => void startTotp()}>Enable OTP</ButtonPrimary>}{enrollment ? <form className="flex flex-col gap-4" onSubmit={confirmTotp}><img className="size-44 rounded-lg border border-white/[0.08] bg-white/[0.04] p-3" src={enrollment.qrCodeDataUrl} alt="OTP enrollment QR code" /><p className="text-xs text-muted">Scan the QR code with your authenticator, then enter the six-digit code.</p><code className="break-all text-xs text-muted">{enrollment.otpauthUri}</code><input className="ui-input" inputMode="numeric" pattern="[0-9]{6}" value={token} onChange={(event) => setToken(event.target.value)} required /><ButtonPrimary type="submit">Confirm OTP</ButtonPrimary></form> : null}</div></LayerCard>
    {recoveryCodes.length ? <LayerCard title="Save your recovery codes"><div role="alert"><p className="text-xs text-muted">These are shown once. Store them securely.</p><pre className="mt-3 overflow-auto rounded-lg border border-white/[0.08] bg-white/[0.04] p-3 text-xs text-primary">{recoveryCodes.join("\n")}</pre></div></LayerCard> : null}
    {profile.totpEnabled ? <><ButtonPrimary type="button" onClick={() => setDisableDialogOpen(true)}>Disable OTP</ButtonPrimary><ConfirmationDialog open={disableDialogOpen} title="Disable OTP" message="Disable OTP authentication? Your current password is required." confirmLabel="Disable OTP" onCancel={() => setDisableDialogOpen(false)} onConfirm={async () => { await hubApi.disableTotp(currentPassword); setCurrentPassword(""); setProfile({ ...profile, totpEnabled: false }); setDisableDialogOpen(false); }} /></> : null}
  </main>;
}
