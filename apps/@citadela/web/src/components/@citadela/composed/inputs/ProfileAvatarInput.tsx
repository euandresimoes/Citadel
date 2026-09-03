import type { ChangeEvent } from "react";
import BaseInput from "../../base/inputs/BaseInput";

interface ProfileAvatarInputProps {
  value?: string | null;
  onChange: (avatarBase64: string | null) => void;
}

function ProfileAvatarInput({ value, onChange }: ProfileAvatarInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") onChange(reader.result);
    }, { once: true });
    reader.readAsDataURL(file);
  }

  return <div className="flex flex-col items-center gap-2">
    <BaseInput id="profile-avatar" label="Profile photo (optional)" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleChange} />
    <label className="relative grid size-24 cursor-pointer place-items-center overflow-hidden rounded-full border border-line bg-raised text-xs text-muted" htmlFor="profile-avatar">
      {value ? <img className="size-full object-cover" src={value} alt="Profile preview" /> : <span aria-hidden="true">Photo</span>}
      <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-canvas text-primary" aria-hidden="true">+</span>
    </label>
    <span className="text-[10px] uppercase tracking-[.2em] text-muted">Profile photo</span>
  </div>;
}

export default ProfileAvatarInput;
