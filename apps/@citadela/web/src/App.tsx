import SetupView from "./views/@citadela/auth/SetupView/SetupView";
import LoginView from "./views/@citadela/auth/LoginView/LoginView";
import { useHubAuth } from "./hooks/@citadela/auth/useHubAuth";
import Shell from "./components/@citadela/ui/Shell/Shell";

function App() {
  const auth = useHubAuth();
  if (auth.setupLoading || auth.loading) return <main>Loading…</main>;
  if (auth.setupError) return <main role="alert">{auth.setupError.message}</main>;
  if (auth.setup?.configured === false) return <SetupView onSubmit={auth.createProfile} />;
  if (!auth.session) return <LoginView onLogin={auth.login} />;
  return <Shell />;
}

export default App;
