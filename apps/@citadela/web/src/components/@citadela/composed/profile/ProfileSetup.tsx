import { useEffect, useState, type FormEvent } from "react";
import BaseModal from "../../base/modals/BaseModal";
import ButtonNext from "../../base/buttons/ButtonNext";
import ButtonBack from "../../base/buttons/ButtonBack";
import ButtonFinish from "../../base/buttons/ButtonFinish";
import InputPassword from "../inputs/InputPassword";
import ProfileAvatarInput from "../inputs/ProfileAvatarInput";
import InputText from "../inputs/InputText";
import InputOtp from "../inputs/InputOtp";
import { hubApi } from "../../../../services/@citadela/hub/hubApi";

interface ProfileSetupProps {
  onSubmit: (password: string, displayName: string, avatarBase64?: string) => Promise<void>;
  onComplete: () => Promise<void>;
  profileCreated?: boolean;
}

type Page = "details" | "otp-enrollment";

function ProfileSetup({ onSubmit, onComplete, profileCreated: initiallyCreated = false }: ProfileSetupProps) {
  const [page, setPage] = useState<Page>("details");
  const [displayName, setDisplayName] = useState("");
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [token, setToken] = useState("");
  const [enrollment, setEnrollment] = useState<{ otpauthUri: string; qrCodeDataUrl: string } | null>(null);
  const [profileCreated, setProfileCreated] = useState(initiallyCreated);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  function navigate(nextPage: Page, nextDirection: "forward" | "back") {
    setDirection(nextDirection);
    setPage(nextPage);
  }

  useEffect(() => {
    if (!initiallyCreated || enrollment) return;
    setBusy(true);
    void hubApi.beginTotpEnrollment().then((value) => { setEnrollment(value); navigate("otp-enrollment", "forward"); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to configure OTP")).finally(() => setBusy(false));
  }, [initiallyCreated]);

  async function handleDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== passwordConfirmation) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      if (!profileCreated) { await onSubmit(password, displayName, avatarBase64 ?? undefined); setProfileCreated(true); }
      setEnrollment(await hubApi.beginTotpEnrollment());
      navigate("otp-enrollment", "forward");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create profile"); }
    finally { setBusy(false); }
  }

  async function confirmOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try { await hubApi.confirmTotpEnrollment(token); await onComplete(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to confirm OTP"); }
    finally { setBusy(false); }
  }

  return <BaseModal open title={page === "details" ? "Create your account" : "Enable two-step verification"} onClose={() => undefined} showClose={false} showHeader={false} className="max-w-[350px] p-0" contentClassName="p-0">
    <div className={`flex w-full overflow-hidden ${direction === "forward" ? "animate-[slide-in-right_300ms_ease-out]" : "animate-[slide-in-left_300ms_ease-out]"}`} data-page={page}>
      {page === "details" ? <section className="flex min-w-0 flex-1 flex-col gap-3.5 p-6">
        <header className="text-center"><h1 className="font-heading text-xl font-semibold text-primary">Create your account</h1></header>
        <form className="flex flex-col gap-3.5 p-6" onSubmit={handleDetails}>
          <ProfileAvatarInput value={avatarBase64} onChange={setAvatarBase64} />
          <InputText name="displayName" placeholder="Ada Winters" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <InputPassword label="Password" name="password" placeholder="Minimum 12 characters" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required />
          <InputPassword label="Confirm password" name="passwordConfirmation" placeholder="Repeat your password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={12} required />
          <div className="mt-2 flex gap-3"><ButtonNext type="submit" disabled={busy}>{busy ? "Saving…" : "Next"}</ButtonNext></div>
        </form>
      </section> : null}
      {page === "otp-enrollment" && enrollment ? <section className="flex min-w-0 flex-1 flex-col gap-3.5 p-6">
        <header className="text-center"><h2 className="font-heading text-xl font-semibold text-primary">Enable two-step verification</h2><p className="mt-2 text-xs text-muted">Scan the QR code with your authenticator app.</p></header>
        <form className="flex flex-col gap-3.5" onSubmit={confirmOtp}>
          <div className="flex flex-col items-center gap-3"><img className="size-44 border border-line bg-raised p-3" src={enrollment.qrCodeDataUrl} alt="OTP QR Code" /><span className="text-[10px] uppercase tracking-[.2em] text-muted">Scan with authenticator</span></div>
          <InputOtp label="Verification code" name="token" value={token} onChange={(event) => setToken(event.target.value)} required />
          <div className="mt-2 flex gap-3"><ButtonBack type="button" onClick={() => { setEnrollment(null); navigate("details", "back"); }} disabled={busy}>Back</ButtonBack><ButtonFinish type="submit" disabled={busy}>{busy ? "Confirming…" : "Finish"}</ButtonFinish></div>
        </form>
      </section> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </BaseModal>;
}

export default ProfileSetup;
