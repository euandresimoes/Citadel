import { useState, type FormEvent } from "react";
import BaseModal from "../../../../components/@citadela/base/modals/BaseModal";
import ButtonPrimary from "../../../../components/@citadela/base/buttons/ButtonPrimary";
import InputOtp from "../../../../components/@citadela/composed/inputs/InputOtp";
import InputPassword from "../../../../components/@citadela/composed/inputs/InputPassword";
import SelectSegmented from "../../../../components/@citadela/composed/selects/SelectSegmented";
import type { HubProfile } from "../../../../services/@citadela/hub/hubApi";

interface LoginViewProps {
  onLogin: (method: "password" | "otp", credential: string) => Promise<void>;
  profile?: Pick<HubProfile, "displayName" | "avatarBase64">;
}

function LoginView({ onLogin, profile }: LoginViewProps) {
  const [method, setMethod] = useState<"password" | "otp">("password");
  const [credential, setCredential] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try { await onLogin(method, credential); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to sign in"); }
    finally { setSubmitting(false); }
  }

  return <main className="grid min-h-screen place-items-center bg-canvas p-4">
    <BaseModal open title="Sign in to Citadela" onClose={() => undefined} showClose={false} showHeader={false} className="max-w-[350px] p-0">
      <div className="flex flex-col gap-4 p-6">
        <div className="mb-1 flex flex-col items-center gap-2">
          {profile?.avatarBase64 ? <img className="size-18 rounded-full border border-line object-cover" src={profile.avatarBase64} alt="" /> : <span className="grid size-18 place-items-center rounded-full border border-line bg-raised text-lg text-muted" aria-hidden="true">{(profile?.displayName ?? "Admin").slice(0, 1).toUpperCase()}</span>}
          <h1 className="font-heading text-lg font-semibold text-primary">{profile?.displayName ?? "Admin"}</h1>
        </div>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <SelectSegmented label="Authentication method" name="method" value={method} onChange={(nextMethod) => { setMethod(nextMethod as "password" | "otp"); setCredential(""); }} options={[{ value: "password", label: "Password" }, { value: "otp", label: "OTP" }]} />
          {method === "password" ? <InputPassword label="Password" name="credential" value={credential} onChange={(event) => setCredential(event.target.value)} required /> : <InputOtp label="Authentication code" name="credential" value={credential} onChange={(event) => setCredential(event.target.value)} required />}
          {error ? <p className="text-xs text-red-300" role="alert">{error}</p> : null}
          <ButtonPrimary type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</ButtonPrimary>
        </form>
      </div>
    </BaseModal>
  </main>;
}

export default LoginView;
