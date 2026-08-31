import type { BaseInputProps } from "./BaseInput";
import BaseInput from "./BaseInput";
import "./InputSearch.scss";

function InputSearch(props: BaseInputProps) {
  return <BaseInput {...props} type="search" className={`input-search ${props.className ?? ""}`} />;
}

export default InputSearch;
