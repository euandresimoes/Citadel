import { useState, type FormEvent } from "react";
import ButtonPrimary from "../../../../components/@citadela/base/buttons/ButtonPrimary";
import InputPassword from "../../../../components/@citadela/composed/inputs/InputPassword";
import "./SetupView.scss";

interface SetupViewProps {
  onSubmit: (password: string, displayName: string) => Promise<void>;
}

function SetupView({ onSubmit }: SetupViewProps) {
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try { await onSubmit(password, displayName); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create profile"); }
    finally { setSubmitting(false); }
  }

  return <main className="setup-view">
    <form className="setup-view__form" onSubmit={handleSubmit}>
      <h1>Create your Citadela profile</h1>
      <label><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <InputPassword label="Password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required />
      {error ? <p role="alert">{error}</p> : null}
      <ButtonPrimary type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create profile"}</ButtonPrimary>
    </form>
  </main>;
}

export default SetupView;
