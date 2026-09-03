import type { BaseInputProps } from "./BaseInput";
import BaseInput from "./BaseInput";

function InputSearch(props: BaseInputProps) {
  return <BaseInput {...props} type="search" className={props.className} />;
}

export default InputSearch;
