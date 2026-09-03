import { useRef, type ChangeEvent, type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent } from "react";

const OTP_LENGTH = 6;

interface InputOtpProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  label: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

function InputOtp({ label, name, id, value = "", onChange, disabled, required, ...props }: InputOtpProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
  while (digits.length < OTP_LENGTH) digits.push("");
  const inputId = id ?? name ?? "otp";

  function emit(nextDigits: string[]) {
    if (!onChange) return;
    onChange({ target: { name, value: nextDigits.join("") } } as ChangeEvent<HTMLInputElement>);
  }

  function updateDigit(index: number, rawValue: string) {
    const nextDigits = [...digits];
    nextDigits[index] = rawValue.replace(/\D/g, "").slice(-1);
    emit(nextDigits);
    if (nextDigits[index] && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Backspace") return;
    event.preventDefault();
    const nextDigits = [...digits];
    nextDigits[index] = "";
    emit(nextDigits);
    if (index > 0) inputRefs.current[index - 1]?.focus();
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
    emit(Array.from({ length: OTP_LENGTH }, (_, index) => pasted[index] ?? ""));
    if (pasted.length > 0) inputRefs.current[Math.min(pasted.length, OTP_LENGTH) - 1]?.focus();
  }

  return <fieldset className="flex min-w-0 flex-col gap-2 border-0 p-0" disabled={disabled}>
    <legend className="ui-label mb-1">{label}</legend>
    <div className="flex gap-1">
      {digits.map((digit, index) => <input
        {...props}
        key={`${inputId}-${index}`}
        ref={(element) => { inputRefs.current[index] = element; }}
        id={`${inputId}-${index + 1}`}
        name={index === 0 ? name : undefined}
        type="text"
        inputMode="numeric"
        autoComplete={index === 0 ? "one-time-code" : "off"}
        maxLength={1}
        pattern="[0-9]"
        value={digit}
        required={required}
        aria-label={`${label} ${index + 1}`}
        onChange={(event) => updateDigit(index, event.target.value)}
        onKeyDown={(event) => handleKeyDown(index, event)}
        onPaste={handlePaste}
        className="size-8 border border-line bg-raised p-0 text-center text-xs text-primary outline-none focus:border-accent"
      />)}
    </div>
  </fieldset>;
}

export default InputOtp;
