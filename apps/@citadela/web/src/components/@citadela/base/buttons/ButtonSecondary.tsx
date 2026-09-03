import type { BaseButtonProps } from "./BaseButton";
import BaseButton from "./BaseButton";

function ButtonSecondary(props: BaseButtonProps) {
  return <BaseButton {...props} className={`ui-button--secondary ${props.className ?? ""}`} />;
}

export default ButtonSecondary;
