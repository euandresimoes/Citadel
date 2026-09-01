import type { BaseButtonProps } from "./BaseButton";
import BaseButton from "./BaseButton";
import "./ButtonSecondary.scss";

function ButtonSecondary(props: BaseButtonProps) {
  return <BaseButton {...props} className={`button-secondary ${props.className ?? ""}`} />;
}

export default ButtonSecondary;
