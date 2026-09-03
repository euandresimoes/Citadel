import SetupView from "./views/@citadela/auth/SetupView/SetupView";
import LoginView from "./views/@citadela/auth/LoginView/LoginView";
import { useHubAuth } from "./hooks/@citadela/auth/useHubAuth";
import Shell from "./components/@citadela/ui/Shell/Shell";

function App() {
  const auth = useHubAuth();
  if (auth.setupLoading || auth.loading) return <main className="grid min-h-screen place-items-center bg-canvas text-xs text-muted">Loading…</main>;
  if (auth.setupError) return <main className="grid min-h-screen place-items-center bg-canvas px-4 text-xs text-red-200" role="alert">{auth.setupError.message}</main>;
  if (auth.setup?.configured === false) return <SetupView onSubmit={auth.createProfile} onComplete={auth.completeSetup} profileCreated={auth.setup.profileCreated} />;
  if (!auth.session) return <LoginView onLogin={auth.login} profile={auth.setup?.profile} />;
  return <Shell />;
}

export default App;
