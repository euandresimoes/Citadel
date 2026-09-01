import { useState, type FormEvent } from "react";
import ButtonPrimary from "../../../../components/@citadela/base/buttons/ButtonPrimary";
import ButtonSecondary from "../../../../components/@citadela/base/buttons/ButtonSecondary";
import InputOtp from "../../../../components/@citadela/composed/inputs/InputOtp";
import InputPassword from "../../../../components/@citadela/composed/inputs/InputPassword";
import "./LoginView.scss";

interface LoginViewProps {
  onLogin: (method: "password" | "otp", credential: string) => Promise<void>;
}

function LoginView({ onLogin }: LoginViewProps) {
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

  return <main className="login-view">
    <form className="login-view__form" onSubmit={handleSubmit}>
      <h1>Sign in to Citadela</h1>
      <div className="login-view__methods" role="group" aria-label="Authentication method">
        <ButtonPrimary type="button" onClick={() => { setMethod("password"); setCredential(""); }} aria-pressed={method === "password"}>Password</ButtonPrimary>
        <ButtonSecondary type="button" onClick={() => { setMethod("otp"); setCredential(""); }} aria-pressed={method === "otp"}>OTP</ButtonSecondary>
      </div>
      {method === "password" ? <InputPassword label="Password" name="credential" value={credential} onChange={(event) => setCredential(event.target.value)} required /> : <InputOtp label="Authentication code" name="credential" value={credential} onChange={(event) => setCredential(event.target.value)} required />}
      {error ? <p role="alert">{error}</p> : null}
      <ButtonPrimary type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</ButtonPrimary>
    </form>
  </main>;
}

export default LoginView;
