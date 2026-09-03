import type { KeyboardEvent } from "react";
import type { BaseSelectOption } from "../../base/selects/BaseSelect";

interface SelectSegmentedProps {
  label?: string;
  options: BaseSelectOption[];
  value: string;
  name?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function SelectSegmented({ label, options, value, name, onChange, disabled }: SelectSegmentedProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % options.length : (index - 1 + options.length) % options.length;
    const next = options[nextIndex];
    if (next) onChange(next.value);
  }

  return <fieldset className="min-w-0 border-0 p-0" disabled={disabled}>
    {label ? <legend className="ui-label mb-1.5">{label}</legend> : null}
    <div className="flex w-full" role="group" aria-label={label}>
      {options.map((option, index) => <button key={option.value} type="button" name={name} className={`min-h-8 flex-1 -ml-px border border-line px-2.5 text-xs text-primary first:ml-0 hover:bg-hover focus-visible:z-10 focus-visible:border-accent focus-visible:outline-none ${value === option.value ? "bg-[#f8f8f8] text-black hover:bg-white" : "bg-raised"}`} aria-pressed={value === option.value} onClick={() => onChange(option.value)} onKeyDown={(event) => handleKeyDown(event, index)}>{option.label}</button>)}
    </div>
  </fieldset>;
}

export default SelectSegmented;
