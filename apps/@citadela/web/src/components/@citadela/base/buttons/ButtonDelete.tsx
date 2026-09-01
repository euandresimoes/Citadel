import type { BaseButtonProps } from "./BaseButton";
import BaseButton from "./BaseButton";
import "./ButtonDelete.scss";

function ButtonDelete(props: BaseButtonProps) {
  return <BaseButton {...props} className={`button-delete ${props.className ?? ""}`} />;
}

export default ButtonDelete;
