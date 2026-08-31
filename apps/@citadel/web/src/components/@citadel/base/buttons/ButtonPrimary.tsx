import type { BaseButtonProps } from "./BaseButton";
import BaseButton from "./BaseButton";
import "./ButtonPrimary.scss";

function ButtonPrimary(props: BaseButtonProps) {
  return <BaseButton {...props} className={`button-primary ${props.className ?? ""}`} />;
}

export default ButtonPrimary;
