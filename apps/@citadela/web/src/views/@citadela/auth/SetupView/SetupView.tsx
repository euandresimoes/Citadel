import ProfileSetup from "../../../../components/@citadela/composed/profile/ProfileSetup";

interface SetupViewProps {
  onSubmit: (password: string, displayName: string, avatarBase64?: string) => Promise<void>;
  onComplete: () => Promise<void>;
  profileCreated?: boolean;
}

function SetupView({ onSubmit, onComplete, profileCreated }: SetupViewProps) {
  return <main className="grid min-h-screen place-items-center bg-canvas p-4"><ProfileSetup onSubmit={onSubmit} onComplete={onComplete} profileCreated={profileCreated} /></main>;
}

export default SetupView;
