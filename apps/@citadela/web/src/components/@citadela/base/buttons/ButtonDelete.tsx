import type { BaseButtonProps } from "./BaseButton";
import BaseButton from "./BaseButton";

function ButtonDelete(props: BaseButtonProps) {
  return <BaseButton {...props} className={`ui-button--danger ${props.className ?? ""}`} />;
}

export default ButtonDelete;
