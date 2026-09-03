import type { BaseButtonProps } from "./BaseButton";
import BaseButton from "./BaseButton";

function ButtonPrimary(props: BaseButtonProps) {
  return <BaseButton {...props} className={`ui-button--primary ${props.className ?? ""}`} />;
}

export default ButtonPrimary;
