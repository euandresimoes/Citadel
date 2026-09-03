import type { BaseButtonProps } from "./BaseButton";
import BaseButton from "./BaseButton";

function ButtonAccent(props: BaseButtonProps) {
  return <BaseButton {...props} className={`ui-button--accent ${props.className ?? ""}`} />;
}

export default ButtonAccent;
